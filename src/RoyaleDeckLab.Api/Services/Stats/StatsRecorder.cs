using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Channels;
using Microsoft.Extensions.Caching.Memory;

namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>Where a visit came from: the referring site, or a campaign link's utm_ tags, which win over it.</summary>
public sealed record VisitOrigin(string? ReferrerHost, string? UtmSource = null, string? UtmCampaign = null);

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

    /// <summary>Far above real traffic. Past it, a day's events are dropped so a flood can't fill the disk.</summary>
    public const int MaxEventsPerDay = 200_000;

    private static readonly TimeSpan ServedFor = TimeSpan.FromMinutes(30);
    private const int MaxActive = 50_000;

    public static readonly TimeSpan ActiveWindow = TimeSpan.FromMinutes(5);

    private readonly object _capLock = new();
    private DateOnly _capDay;
    private int _eventsToday;
    private DateOnly _capWarnedDay;

    private readonly Channel<StatsEvent> _queue = Channel.CreateBounded<StatsEvent>(
        new BoundedChannelOptions(10_000) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });

    private readonly MemoryCache _served = new(new MemoryCacheOptions { SizeLimit = 50_000 });

    private readonly ConcurrentDictionary<string, long> _lastSeen = new();
    private long _nextPruneMs;

    public int DailyCap { get; init; } = MaxEventsPerDay;

    public ChannelReader<StatsEvent> Queue => _queue.Reader;

    public static string NormalizeTag(string tag) => "#" + tag.Trim().TrimStart('#').ToUpperInvariant();

    /// <summary>Remembers that the server just loaded this player, so a page's ping about them can be believed.</summary>
    public void NoteServed(string tag)
        => _served.Set(NormalizeTag(tag), true, new MemoryCacheEntryOptions { Size = 1, SlidingExpiration = ServedFor });

    public bool WasServed(string tag) => _served.TryGetValue(NormalizeTag(tag), out _);

    /// <param name="subject">What the event is about, hashed before it's stored: a player tag, or a tag and share code.</param>
    public bool Record(HttpContext context, string kind, string? subject = null, string? tool = null, VisitOrigin? origin = null)
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
            var day = DateOnly.FromDateTime(now.UtcDateTime);
            if (!UnderDailyCap(day))
            {
                return false;
            }

            var secret = store.SecretFor(StatsStore.Month(day));
            var ip = context.Connection.RemoteIpAddress?.ToString() ?? "";
            var country = context.Items.ContainsKey(ViaCloudflare)
                ? StatsClassify.Country(context.Request.Headers["CF-IPCountry"].ToString())
                : null;
            var visitor = Hash(secret, "visitor", $"{ip}\n{userAgent}");
            var written = _queue.Writer.TryWrite(new StatsEvent(
                now.ToUnixTimeMilliseconds(),
                kind,
                visitor,
                subject is null ? [] : Hash(secret, "subject", subject),
                tool ?? "",
                country,
                StatsClassify.Device(userAgent),
                StatsClassify.UtmSource(origin?.UtmSource) ?? StatsClassify.Source(origin?.ReferrerHost),
                StatsClassify.Campaign(origin?.UtmCampaign)));
            if (written)
            {
                CountEvent(day);
                if (kind != StatsStore.Kinds.Preview)
                {
                    NoteActive(visitor, now.ToUnixTimeMilliseconds());
                }
            }
            return written;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Couldn't record a {Kind} stats event", kind);
            return false;
        }
    }

    /// <summary>Visitors seen in the last <see cref="ActiveWindow"/>, kept in memory only; a restart starts it at zero.</summary>
    public int ActiveNow()
    {
        var since = clock.GetUtcNow().ToUnixTimeMilliseconds() - (long)ActiveWindow.TotalMilliseconds;
        return _lastSeen.Count(entry => entry.Value >= since);
    }

    // Once full, it sheds visitors who left at most every few seconds, and meanwhile only updates the ones it has,
    // so a flood can't grow it or make every request scan it.
    private void NoteActive(byte[] visitor, long atMs)
    {
        if (_lastSeen.Count >= MaxActive && atMs >= Interlocked.Read(ref _nextPruneMs))
        {
            Interlocked.Exchange(ref _nextPruneMs, atMs + 10_000);
            var since = atMs - (long)ActiveWindow.TotalMilliseconds;
            foreach (var entry in _lastSeen.Where(e => e.Value < since))
            {
                _lastSeen.TryRemove(entry);
            }
        }
        var key = Convert.ToHexString(visitor);
        if (_lastSeen.Count < MaxActive || _lastSeen.ContainsKey(key))
        {
            _lastSeen[key] = atMs;
        }
    }

    private bool UnderDailyCap(DateOnly day)
    {
        lock (_capLock)
        {
            if (day != _capDay)
            {
                _capDay = day;
                _eventsToday = 0;
            }
            if (_eventsToday < DailyCap)
            {
                return true;
            }
            if (_capWarnedDay != day)
            {
                _capWarnedDay = day;
                logger.LogWarning("Stats events for {Day} reached the daily cap of {Cap}; the rest of the day's events are dropped", day, DailyCap);
            }
            return false;
        }
    }

    private void CountEvent(DateOnly day)
    {
        lock (_capLock)
        {
            if (day == _capDay)
            {
                _eventsToday++;
            }
        }
    }

    private static byte[] Hash(byte[] secret, string purpose, string value)
        => HMACSHA256.HashData(secret, Encoding.UTF8.GetBytes($"{purpose}\n{value}"))[..16];
}
