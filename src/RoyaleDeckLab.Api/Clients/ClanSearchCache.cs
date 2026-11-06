using Microsoft.Extensions.Caching.Memory;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Clients;

/// <summary>
/// Clan name searches, cached for a few minutes per name: the field searches as someone types, and clans named
/// "dutch" don't change by the minute. A failed search is dropped at once, so the next request tries again.
/// </summary>
public sealed class ClanSearchCache(IHttpClientFactory httpFactory, IMemoryCache memory)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(5);

    private const int Limit = 20;
    private readonly object _gate = new();

    public async Task<IReadOnlyList<ClanSummary>> SearchAsync(string name, CancellationToken ct = default)
    {
        var query = name.Trim();
        var key = (nameof(ClanSearchCache), query.ToLowerInvariant());
        ct.ThrowIfCancellationRequested();
        Lazy<Task<IReadOnlyList<ClanSummary>>> fetch;
        lock (_gate)
        {
            if (!memory.TryGetValue(key, out Lazy<Task<IReadOnlyList<ClanSummary>>>? cached) || cached is null)
            {
                cached = new Lazy<Task<IReadOnlyList<ClanSummary>>>(() => FetchAsync(query));
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
                if (memory.TryGetValue(key, out Lazy<Task<IReadOnlyList<ClanSummary>>>? cached) && ReferenceEquals(cached, fetch))
                    memory.Remove(key);
            }
            throw;
        }
    }

    private async Task<IReadOnlyList<ClanSummary>> FetchAsync(string name)
    {
        var client = new ClashRoyaleClient(httpFactory.CreateClient(nameof(ClashRoyaleClient)));
        return ClanSummary.ListFrom(await client.SearchClansAsync(name, Limit, CancellationToken.None));
    }
}
