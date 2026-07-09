using System.Collections.Concurrent;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

// Caches the CPU-heavy Advise() result per tag for the profile TTL, coalescing
// concurrent requests (same pattern as PlayerProfileCache). Entries also key on
// the meta version so a rebuild or epoch set invalidates immediately. Singleton.
public sealed class UpgradeAdviceCache(
    PlayerProfileCache players,
    MetaCache cache,
    UpgradeAdvisor advisor,
    TimeProvider clock)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    private const int SweepThreshold = 256;

    private readonly ConcurrentDictionary<string, Entry> _entries = new();

    private sealed record Entry(long Stamp, long MetaVersion, Lazy<Task<Result>> Compute);

    // Advice is null when the upstream profile carried no cards.
    public sealed record Result(CrPlayer Player, UpgradeAdvice? Advice);

    public async Task<Result> GetAsync(string playerTag, CancellationToken ct = default)
    {
        var key = playerTag.TrimStart('#').ToUpperInvariant();
        if (_entries.Count > SweepThreshold)
        {
            SweepExpired();
        }

        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var version = cache.Version;
            var entry = _entries.GetOrAdd(key, _ => new Entry(
                clock.GetTimestamp(),
                version,
                new Lazy<Task<Result>>(() => ComputeAsync(playerTag))));

            if (clock.GetElapsedTime(entry.Stamp) > Ttl || entry.MetaVersion != version)
            {
                _entries.TryRemove(KeyValuePair.Create(key, entry));
                continue;
            }

            try
            {
                return await entry.Compute.Value.WaitAsync(ct);
            }
            catch when (!ct.IsCancellationRequested)
            {
                // Evict failures so the next request retries; a cancelled caller
                // doesn't evict, since the shared computation may still succeed for others.
                _entries.TryRemove(KeyValuePair.Create(key, entry));
                throw;
            }
        }
    }

    private async Task<Result> ComputeAsync(string playerTag)
    {
        // Not the caller's token: one caller aborting must not cancel the shared computation.
        var player = await players.GetPlayerDataAsync(playerTag, CancellationToken.None);
        if (player.Cards is null)
        {
            return new Result(player, null);
        }
        var playerCards = player.Cards.Select(c => c.ToPlayerItemLevel()).ToList();
        return new Result(player, advisor.Advise(playerCards, cache.Meta));
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
