using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Options;
using SkiaSharp;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Card art re-encoded from the CR CDN's ~200 KB PNGs to ~15 KB WebPs, kept on disk next to the meta db.
/// Each WebP gets a version from its bytes, so a published URL never points at different art.
/// </summary>
public sealed partial class CardArtCache
{
    public const string HttpClientName = "CardArt";
    public const string AssetHost = "https://api-assets.clashroyale.com/";

    private const int WebpQuality = 85;
    private const int VersionLength = 8;

    private readonly IHttpClientFactory _httpFactory;
    private readonly CardCatalog _catalog;
    private readonly ILogger<CardArtCache> _logger;
    private readonly string _dir;
    private readonly ConcurrentDictionary<string, Lazy<Task<string?>>> _inFlight = new();
    private readonly ConcurrentDictionary<string, string> _versions = new();

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
        var dbFolder = Path.GetDirectoryName(dbPath)
            ?? throw new InvalidOperationException($"The meta database path has no folder: {dbPath}");
        _dir = Path.Combine(dbFolder, "card-art");
    }

    [GeneratedRegex("^(cards|cardevolutions|cardheroes)$")]
    private static partial Regex KindPattern();

    [GeneratedRegex("^[A-Za-z0-9_-]{16,128}$")]
    private static partial Regex HashPattern();

    public static bool IsWellFormed(string kind, string hash) =>
        KindPattern().IsMatch(kind) && HashPattern().IsMatch(hash);

    [GeneratedRegex(@"^https://api-assets\.clashroyale\.com/(cards|cardevolutions|cardheroes)/300/([A-Za-z0-9_-]{16,128})\.png$")]
    private static partial Regex AssetUrlPattern();

    /// <summary>Splits a CR CDN art URL into the kind and hash <see cref="GetAsync"/> takes.</summary>
    public static bool TryParseUrl(string url, out string kind, out string hash)
    {
        var match = AssetUrlPattern().Match(url);
        (kind, hash) = match.Success ? (match.Groups[1].Value, match.Groups[2].Value) : ("", "");
        return match.Success;
    }

    /// <summary>
    /// The URL the site serves a CR art URL under. Until the art's WebP is on disk the CR URL is kept,
    /// which the client maps to the unversioned /img path.
    /// </summary>
    public string PublishedUrl(string upstreamUrl)
    {
        if (!TryParseUrl(upstreamUrl, out var kind, out var hash))
        {
            return upstreamUrl;
        }
        if (!_versions.TryGetValue(Key(kind, hash), out var version))
        {
            return upstreamUrl;
        }
        return $"/img/{kind}/{hash}.webp?v={version}";
    }

    public bool IsCurrentVersion(string kind, string hash, string? version) =>
        version is not null
        && _versions.TryGetValue(Key(kind, hash), out var current)
        && current == version;

    /// <summary>Path of the cached WebP, or null when the art is not a known card's.</summary>
    public async Task<string?> GetAsync(string kind, string hash, CancellationToken ct = default)
    {
        if (!IsWellFormed(kind, hash))
        {
            return null;
        }

        var path = ArtPath(kind, hash);
        if (File.Exists(path))
        {
            return path;
        }
        return await DownloadOnceAsync(kind, hash, ct);
    }

    /// <summary>Downloads the art again when CR has replaced it under the same URL, which it does without notice.</summary>
    public async Task RefreshAsync(string kind, string hash, CancellationToken ct)
    {
        if (!IsWellFormed(kind, hash))
        {
            return;
        }
        await DownloadOnceAsync(kind, hash, ct);
    }

    /// <summary>Publishes the art already on disk, so responses carry versioned URLs from the first request.</summary>
    public async Task LoadVersionsFromDiskAsync()
    {
        if (!Directory.Exists(_dir))
        {
            return;
        }
        foreach (var path in Directory.EnumerateFiles(_dir, "*.webp", SearchOption.AllDirectories))
        {
            var kind = Path.GetFileName(Path.GetDirectoryName(path)) ?? "";
            var hash = Path.GetFileNameWithoutExtension(path);
            if (!IsWellFormed(kind, hash))
            {
                continue;
            }
            try
            {
                await RememberVersionFromDiskAsync(kind, hash, path);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _logger.LogWarning(ex, "Could not read card art {Kind}/{Hash}; the next refresh downloads it again", kind, hash);
            }
        }
    }

    private static string Key(string kind, string hash) => $"{kind}/{hash}";

    private string ArtPath(string kind, string hash) => Path.Combine(_dir, kind, hash + ".webp");

    private static string EntityTagPath(string artPath) => Path.ChangeExtension(artPath, ".etag");

    private async Task<string?> DownloadOnceAsync(string kind, string hash, CancellationToken ct)
    {
        var key = Key(kind, hash);
        var download = _inFlight.GetOrAdd(key, _ => new Lazy<Task<string?>>(() => DownloadThenReleaseAsync(key, kind, hash)));
        return await download.Value.WaitAsync(ct);
    }

    // Released by the download itself, not by a waiter: a waiter that gives up early would otherwise let a
    // second download of the same art run alongside, and the two could leave old art next to a new ETag.
    private async Task<string?> DownloadThenReleaseAsync(string key, string kind, string hash)
    {
        try
        {
            return await DownloadAsync(kind, hash);
        }
        finally
        {
            _inFlight.TryRemove(key, out _);
        }
    }

    // Detached from the request's token: one client giving up shouldn't fail the others waiting on it.
    private async Task<string?> DownloadAsync(string kind, string hash)
    {
        var upstream = $"{AssetHost}{kind}/300/{hash}.png";
        var path = ArtPath(kind, hash);
        try
        {
            if (!await IsCatalogArtAsync(upstream))
            {
                return null;
            }

            using var request = new HttpRequestMessage(HttpMethod.Get, upstream);
            var cachedTag = await ReadEntityTagAsync(path);
            if (cachedTag is not null)
            {
                request.Headers.IfNoneMatch.Add(cachedTag);
            }

            var http = _httpFactory.CreateClient(HttpClientName);
            using var response = await http.SendAsync(request);
            if (response.StatusCode is HttpStatusCode.NotModified)
            {
                await RememberVersionFromDiskAsync(kind, hash, path);
                return path;
            }
            if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden)
            {
                return null;
            }
            response.EnsureSuccessStatusCode();
            var png = await response.Content.ReadAsByteArrayAsync();
            var webp = EncodeWebp(png, upstream);

            Directory.CreateDirectory(Path.GetDirectoryName(path) ?? _dir);
            await WriteAtomicallyAsync(path, webp);
            _versions[Key(kind, hash)] = VersionOf(webp);
            await SaveEntityTagAsync(path, response.Headers.ETag);
            return path;
        }
        catch (Exception ex) when (File.Exists(path))
        {
            _logger.LogWarning(ex, "Refreshing card art {Url} failed; serving the stale copy", upstream);
            await RememberVersionFromDiskAsync(kind, hash, path);
            return path;
        }
    }

    private static byte[] EncodeWebp(byte[] png, string upstream)
    {
        using var bitmap = SKBitmap.Decode(png)
            ?? throw new InvalidDataException($"Could not decode {upstream}");
        using var webp = bitmap.Encode(SKEncodedImageFormat.Webp, WebpQuality)
            ?? throw new InvalidDataException($"Could not encode {upstream} as WebP");
        return webp.ToArray();
    }

    private static async Task WriteAtomicallyAsync(string path, byte[] bytes)
    {
        var temp = $"{path}.{Guid.NewGuid():N}.tmp";
        await File.WriteAllBytesAsync(temp, bytes);
        File.Move(temp, path, overwrite: true);
    }

    // The tag is only trusted next to the WebP it was saved with, so a deleted WebP is always downloaded in full.
    private static async Task<EntityTagHeaderValue?> ReadEntityTagAsync(string artPath)
    {
        var tagPath = EntityTagPath(artPath);
        var hasBoth = File.Exists(artPath) && File.Exists(tagPath);
        if (!hasBoth)
        {
            return null;
        }
        var text = await File.ReadAllTextAsync(tagPath);
        return EntityTagHeaderValue.TryParse(text, out var tag) ? tag : null;
    }

    private static async Task SaveEntityTagAsync(string artPath, EntityTagHeaderValue? tag)
    {
        var tagPath = EntityTagPath(artPath);
        if (tag is null)
        {
            File.Delete(tagPath);
            return;
        }
        await WriteAtomicallyAsync(tagPath, System.Text.Encoding.UTF8.GetBytes(tag.ToString()));
    }

    private async Task RememberVersionFromDiskAsync(string kind, string hash, string path)
    {
        var key = Key(kind, hash);
        if (_versions.ContainsKey(key))
        {
            return;
        }
        // TryAdd: a download that finished while the file was being read already holds the newer version.
        _versions.TryAdd(key, VersionOf(await File.ReadAllBytesAsync(path)));
    }

    private static string VersionOf(byte[] webp) =>
        Convert.ToHexStringLower(SHA256.HashData(webp))[..VersionLength];

    private async Task<bool> IsCatalogArtAsync(string url)
    {
        var cards = await _catalog.GetAsync();
        return cards.Any(c => c.IconUrls is { } icons && icons.AllUrls().Contains(url));
    }
}
