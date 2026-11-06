using Microsoft.Extensions.Caching.Memory;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Clients;

/// <summary>
/// Every member opening the clan link asks for the same clan, so one fetch (3 CR API calls) serves them all for a
/// minute. A failed fetch is dropped at once, so the next request tries again.
/// </summary>
public sealed class ClanWarCache(IHttpClientFactory httpFactory, IMemoryCache memory)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    private const int PastWeeks = 4;

    public async Task<ClanWar> GetAsync(ClanTag clanTag, CancellationToken ct = default)
    {
        var key = (nameof(ClanWarCache), clanTag.Value);
        if (!memory.TryGetValue(key, out Lazy<Task<ClanWar>>? fetch) || fetch is null)
        {
            fetch = new Lazy<Task<ClanWar>>(() => FetchAsync(clanTag));
            memory.Set(key, fetch, Ttl);
        }

        try
        {
            return await fetch.Value.WaitAsync(ct);
        }
        catch when (!ct.IsCancellationRequested)
        {
            memory.Remove(key);
            throw;
        }
    }

    private async Task<ClanWar> FetchAsync(ClanTag clanTag)
    {
        var client = new ClashRoyaleClient(httpFactory.CreateClient(nameof(ClashRoyaleClient)));
        var clan = client.GetClanAsync(clanTag.Value, CancellationToken.None);
        var race = client.GetCurrentRiverRaceAsync(clanTag.Value, CancellationToken.None);
        var log = client.GetRiverRaceLogAsync(clanTag.Value, PastWeeks, CancellationToken.None);
        await Task.WhenAll(clan, race, log);

        return ClanWar.From(await clan, await race, await log);
    }
}
