using System.Collections.Concurrent;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Clients;

// Coalesces concurrent/near-in-time requests for the same tag into one in-flight
// upstream fetch, since the SPA warms several player-scoped pages at once. TTL
// stays short so a profile still reflects an upgrade the player just made. Singleton.
public sealed class PlayerProfileCache(IHttpClientFactory httpFactory, TimeProvider clock)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    // Growth guard: distinct tags only pile up until a sweep clears the expired.
    private const int SweepThreshold = 256;

    private readonly ConcurrentDictionary<string, Entry> _entries = new();

    // The Lazy holds the SHARED fetch task: concurrent misses race on GetOrAdd,
    // but only the published entry's factory ever runs.
    private sealed record Entry(long Stamp, Lazy<Task<CrPlayer>> Fetch);

    public async Task<CrPlayer> GetPlayerDataAsync(string playerTag, CancellationToken ct = default)
    {
        // "#2QGG92L9", "2qgg92l9" etc. are the same player to the CR API.
        var key = playerTag.TrimStart('#').ToUpperInvariant();
        if (_entries.Count > SweepThreshold)
        {
            SweepExpired();
        }

        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var entry = _entries.GetOrAdd(key, _ => new Entry(
                clock.GetTimestamp(),
                new Lazy<Task<CrPlayer>>(() => FetchAsync(playerTag))));

            if (clock.GetElapsedTime(entry.Stamp) > Ttl)
            {
                _entries.TryRemove(KeyValuePair.Create(key, entry));
                continue;
            }

            try
            {
                return await entry.Fetch.Value.WaitAsync(ct);
            }
            catch when (!ct.IsCancellationRequested)
            {
                // A failed fetch must not be served for the rest of the TTL: evict
                // so the next request retries upstream. A cancelled caller doesn't
                // evict, since the shared fetch may still succeed for others.
                _entries.TryRemove(KeyValuePair.Create(key, entry));
                throw;
            }
        }
    }

    private async Task<CrPlayer> FetchAsync(string playerTag)
    {
        // Fresh handler-managed client per fetch: this class is a singleton, so
        // holding one HttpClient would pin its handler forever. Deliberately not
        // the caller's token, since one caller aborting must not cancel the
        // fetch shared by the others.
        var client = new ClashRoyaleClient(httpFactory.CreateClient(nameof(ClashRoyaleClient)));
        return await client.GetPlayerDataAsync(playerTag, CancellationToken.None);
    }

    private void SweepExpired()
    {
        foreach (var pair in _entries)
        {
            if (clock.GetElapsedTime(pair.Value.Stamp) > Ttl)
            {
                _entries.TryRemove(pair);
            }
        }
    }
}
