using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Clients;

/// <summary>
/// The CR API calls of the background crawls. It has its own HTTP client, so throttling during a crawl opens only this
/// client's circuit breaker and the player pages keep theirs.
/// </summary>
public sealed class ClashRoyaleCrawlClient(HttpClient http, CrawlConcurrency concurrency)
{
    private readonly ClashRoyaleClient _api = new(http);

    public Task<IReadOnlyList<string>> GetTopWarClansAsync(int limit, CancellationToken ct = default)
        => concurrency.RunAsync(() => _api.GetTopWarClansAsync(limit, ct), ct);

    public Task<IReadOnlyList<string>> GetTopRankedPlayerTagsAsync(int limit, CancellationToken ct = default)
        => concurrency.RunAsync(() => _api.GetTopRankedPlayerTagsAsync(limit, ct), ct);

    public Task<IReadOnlyList<string>> GetClanMemberTagsAsync(string clanTag, CancellationToken ct = default)
        => concurrency.RunAsync(() => _api.GetClanMemberTagsAsync(clanTag, ct), ct);

    public Task<IReadOnlyList<CrBattle>> GetPlayerBattlelogAsync(string playerTag, CancellationToken ct = default)
        => concurrency.RunAsync(() => _api.GetPlayerBattlelogAsync(playerTag, ct), ct);
}
