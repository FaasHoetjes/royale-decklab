using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class UpgradeAdviceCache(
    PlayerProfileCache players, MetaCache cache, UpgradeAdvisor advisor, CalculationScheduler scheduler, TimeProvider clock)
{
    private readonly CalculationCache<UpgradeAdvice> _results = new(clock);

    public sealed record Result(CrPlayer Player, UpgradeAdvice? Advice);

    public async Task<Result> GetAsync(string playerTag, CancellationToken ct = default)
    {
        var player = await players.GetPlayerDataAsync(playerTag, ct);
        if (player.Cards is null) return new Result(player, null);
        var version = cache.Version;
        var meta = cache.Meta;
        var advice = await _results.GetAsync(PlayerCalculationKey.Create(player, version),
            () => scheduler.RunAsync(token => advisor.Advise(
                player.Cards.Select(c => c.ToPlayerItemLevel()).ToList(), meta, token)), ct);
        return new Result(player, advice);
    }
}
