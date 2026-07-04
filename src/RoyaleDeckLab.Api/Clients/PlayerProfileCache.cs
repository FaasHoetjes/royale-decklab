using System.Collections.Concurrent;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Clients;

/// <summary>
/// Short-lived cache with request coalescing for CR player profiles. The SPA
/// warms several player-scoped pages at once (war decks, collection, upgrades),
/// which would otherwise cost three identical upstream calls per tag — instead,
/// concurrent and near-in-time requests share one in-flight fetch. The TTL stays
/// short so a profile still reflects an upgrade the player just made without a
/// long wait. Singleton.
/// </summary>
public sealed class PlayerProfileCache(IHttpClientFactory httpFactory, TimeProvider clock)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    // Growth guard: distinct tags only pile up until a sweep clears the expired.
    private const int SweepThreshold = 256;

    private readonly ConcurrentDictionary<string, Entry> _entries = new();

    // The Lazy holds the SHARED fetch task: concurrent misses race on GetOrAdd,
    // but only the published entry's factory ever runs.
    private sealed record Entry(long Stamp, Lazy<Task<CrPlayer>> Fetch);

    /// <summary>Same contract as <see cref="ClashRoyaleClient.GetPlayerDataAsync"/>, cached per tag.</summary>
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
                // Remove only if still THIS entry, then retry with a fresh one.
                _entries.TryRemove(KeyValuePair.Create(key, entry));
                continue;
            }

            try
            {
                return await entry.Fetch.Value.WaitAsync(ct);
            }
            catch when (!ct.IsCancellationRequested)
            {
                // A failed fetch must not be served for the rest of the TTL —
                // evict so the next request retries upstream. (A cancelled
                // caller doesn't evict: the shared fetch may still succeed.)
                _entries.TryRemove(KeyValuePair.Create(key, entry));
                throw;
            }
        }
    }

    private async Task<CrPlayer> FetchAsync(string playerTag)
    {
        // A fresh handler-managed client per fetch (this class is a singleton,
        // so holding one HttpClient would pin its handler forever). Deliberately
        // NOT the caller's token: the fetch is shared, so one caller aborting
        // must not cancel it for the others.
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
