using Microsoft.Extensions.Caching.Memory;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Clients;

/// <summary>
/// One clan snapshot serves all visitors for a minute; race history has its own longer cache.
/// </summary>
public sealed class ClanWarCache(IHttpClientFactory httpFactory, IMemoryCache memory, TimeProvider clock, ClanHistoryCache history)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    private readonly object _gate = new();

    public async Task<ClanWar> GetAsync(ClanTag clanTag, CancellationToken ct = default)
    {
        var key = (nameof(ClanWarCache), clanTag.Value);
        ct.ThrowIfCancellationRequested();
        Lazy<Task<ClanWar>> fetch;
        lock (_gate)
        {
            if (!memory.TryGetValue(key, out Lazy<Task<ClanWar>>? cached) || cached is null)
            {
                cached = new Lazy<Task<ClanWar>>(() => FetchAsync(clanTag));
                memory.Set(key, cached, Ttl);
            }
            fetch = cached;
        }

        try
        {
            return await fetch.Value.WaitAsync(ct);
        }
        catch when (!ct.IsCancellationRequested)
        {
            lock (_gate)
            {
                if (memory.TryGetValue(key, out Lazy<Task<ClanWar>>? cached) && ReferenceEquals(cached, fetch))
                    memory.Remove(key);
            }
            throw;
        }
    }

    private async Task<ClanWar> FetchAsync(ClanTag clanTag)
    {
        using var http = httpFactory.CreateClient(nameof(ClashRoyaleClient));
        var client = new ClashRoyaleClient(http);
        var clan = client.GetClanAsync(clanTag.Value, CancellationToken.None);
        var race = client.GetCurrentRiverRaceAsync(clanTag.Value, CancellationToken.None);
        var log = history.GetAsync(clanTag, race);
        await Task.WhenAll(clan, race, log);

        return ClanWar.From(await clan, await race, await log, clock.GetUtcNow());
    }
}
