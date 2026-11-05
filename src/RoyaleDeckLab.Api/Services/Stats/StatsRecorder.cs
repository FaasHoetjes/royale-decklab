using System.Security.Cryptography;
using System.Text;
using System.Threading.Channels;
using Microsoft.Extensions.Caching.Memory;

namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>
/// Turns a request into an anonymous stats event: the IP address and browser only go into an HMAC with the month's
/// secret and are never kept. Events queue up for <see cref="StatsWriter"/>, so recording never slows a request down
/// and drops events rather than queueing without bound.
/// </summary>
public sealed class StatsRecorder(StatsStore store, TimeProvider clock, ILogger<StatsRecorder> logger)
{
    /// <summary>The site owner's account, whose lookups would otherwise count every test.</summary>
    public const string OwnerTag = "#2QGG92L9";

    /// <summary>Set on requests that came through Cloudflare, the only ones whose country header can be believed.</summary>
    public const string ViaCloudflare = "stats.via-cloudflare";

    private static readonly TimeSpan ServedFor = TimeSpan.FromMinutes(30);

    private readonly Channel<StatsEvent> _queue = Channel.CreateBounded<StatsEvent>(
        new BoundedChannelOptions(10_000) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });

    private readonly MemoryCache _served = new(new MemoryCacheOptions { SizeLimit = 50_000 });

    public ChannelReader<StatsEvent> Queue => _queue.Reader;

    public static string NormalizeTag(string tag) => "#" + tag.Trim().TrimStart('#').ToUpperInvariant();

    /// <summary>Remembers that the server just loaded this player, so a page's ping about them can be believed.</summary>
    public void NoteServed(string tag)
        => _served.Set(NormalizeTag(tag), true, new MemoryCacheEntryOptions { Size = 1, SlidingExpiration = ServedFor });

    public bool WasServed(string tag) => _served.TryGetValue(NormalizeTag(tag), out _);

    /// <param name="subject">What the event is about, hashed before it's stored: a player tag, or a tag and share code.</param>
    public bool Record(HttpContext context, string kind, string? subject = null, string? tool = null, string? referrerHost = null)
    {
        try
        {
            var userAgent = context.Request.Headers.UserAgent.ToString();
            if (kind != StatsStore.Kinds.Preview && StatsClassify.IsBot(userAgent))
            {
                return false;
            }
            if (kind == StatsStore.Kinds.Lookup && subject == OwnerTag)
            {
                return false;
            }

            var now = clock.GetUtcNow();
            var secret = store.SecretFor(StatsStore.Month(DateOnly.FromDateTime(now.UtcDateTime)));
            var ip = context.Connection.RemoteIpAddress?.ToString() ?? "";
            var country = context.Items.ContainsKey(ViaCloudflare)
                ? StatsClassify.Country(context.Request.Headers["CF-IPCountry"].ToString())
                : null;
            return _queue.Writer.TryWrite(new StatsEvent(
                now.ToUnixTimeMilliseconds(),
                kind,
                Hash(secret, "visitor", $"{ip}\n{userAgent}"),
                subject is null ? [] : Hash(secret, "subject", subject),
                tool ?? "",
                country,
                StatsClassify.Device(userAgent),
                StatsClassify.Source(referrerHost)));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Couldn't record a {Kind} stats event", kind);
            return false;
        }
    }

    private static byte[] Hash(byte[] secret, string purpose, string value)
        => HMACSHA256.HashData(secret, Encoding.UTF8.GetBytes($"{purpose}\n{value}"))[..16];
}
