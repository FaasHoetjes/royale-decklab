using System.Collections.Concurrent;
using System.Net;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Options;
using SkiaSharp;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Card art re-encoded from the CR CDN's ~200 KB PNGs to ~15 KB WebPs, kept on disk next to the meta db.
/// </summary>
public sealed partial class CardArtCache
{
    public const string HttpClientName = "CardArt";
    public const string AssetHost = "https://api-assets.clashroyale.com/";

    // CR replaces art in place under the same URL, so cached files are refetched after this.
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(30);

    private const int WebpQuality = 85;

    private readonly IHttpClientFactory _httpFactory;
    private readonly CardCatalog _catalog;
    private readonly ILogger<CardArtCache> _logger;
    private readonly string _dir;
    private readonly ConcurrentDictionary<string, Lazy<Task<string?>>> _inFlight = new();

    public CardArtCache(
        IHttpClientFactory httpFactory,
        CardCatalog catalog,
        IOptions<MetaOptions> options,
        IHostEnvironment env,
        ILogger<CardArtCache> logger)
    {
        _httpFactory = httpFactory;
        _catalog = catalog;
        _logger = logger;
        var dbPath = Path.GetFullPath(options.Value.DbPath, env.ContentRootPath);
        _dir = Path.Combine(Path.GetDirectoryName(dbPath)!, "card-art");
    }

    [GeneratedRegex("^(cards|cardevolutions|cardheroes)$")]
    private static partial Regex KindPattern();

    [GeneratedRegex("^[A-Za-z0-9_-]{16,128}$")]
    private static partial Regex HashPattern();

    public static bool IsWellFormed(string kind, string hash) =>
        KindPattern().IsMatch(kind) && HashPattern().IsMatch(hash);

    /// <summary>Path of the cached WebP, or null when the art is not a known card's.</summary>
    public async Task<string?> GetAsync(string kind, string hash, CancellationToken ct = default)
    {
        if (!IsWellFormed(kind, hash))
        {
            return null;
        }

        var path = Path.Combine(_dir, kind, hash + ".webp");
        if (File.Exists(path) && DateTime.UtcNow - File.GetLastWriteTimeUtc(path) < MaxAge)
        {
            return path;
        }

        var key = $"{kind}/{hash}";
        var fetch = _inFlight.GetOrAdd(key, _ => new Lazy<Task<string?>>(() => FetchAsync(kind, hash, path)));
        try
        {
            return await fetch.Value.WaitAsync(ct);
        }
        finally
        {
            _inFlight.TryRemove(KeyValuePair.Create(key, fetch));
        }
    }

    // Detached from the request's token: one client giving up shouldn't fail the others waiting on it.
    private async Task<string?> FetchAsync(string kind, string hash, string path)
    {
        var upstream = $"{AssetHost}{kind}/300/{hash}.png";
        try
        {
            if (!await IsCatalogArtAsync(upstream))
            {
                return null;
            }

            var http = _httpFactory.CreateClient(HttpClientName);
            using var response = await http.GetAsync(upstream);
            if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden)
            {
                return null;
            }
            response.EnsureSuccessStatusCode();
            var png = await response.Content.ReadAsByteArrayAsync();

            using var bitmap = SKBitmap.Decode(png)
                ?? throw new InvalidDataException($"Could not decode {upstream}");
            using var webp = bitmap.Encode(SKEncodedImageFormat.Webp, WebpQuality)
                ?? throw new InvalidDataException($"Could not encode {upstream} as WebP");

            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temp = $"{path}.{Guid.NewGuid():N}.tmp";
            await File.WriteAllBytesAsync(temp, webp.ToArray());
            File.Move(temp, path, overwrite: true);
            return path;
        }
        catch (Exception ex) when (File.Exists(path))
        {
            _logger.LogWarning(ex, "Refreshing card art {Url} failed; serving the stale copy", upstream);
            return path;
        }
    }

    private async Task<bool> IsCatalogArtAsync(string url)
    {
        var cards = await _catalog.GetAsync();
        return cards.Any(c => c.IconUrls is { } icons
            && (icons.Medium == url || icons.EvolutionMedium == url || icons.HeroMedium == url));
    }
}
