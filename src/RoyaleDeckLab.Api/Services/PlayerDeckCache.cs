using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record PlayerWarDecks(WarDeckResult Lineup, PlayerSeasonBoosts SeasonBoosts);

public sealed class PlayerDeckCache(
    DeckAnalyzer analyzer,
    CalculationScheduler scheduler,
    SeasonBoostStore seasonBoosts,
    TimeProvider clock)
{
    private readonly CalculationCache<WarDeckResult> _results = new(clock);

    public async Task<PlayerWarDecks> GetAsync(CrPlayer player, long version, IReadOnlyList<DeckMeta> meta,
        LineupOptions options, CancellationToken ct = default)
    {
        var cards = player.Cards!.Select(c => c.ToPlayerItemLevel()).ToCardMap();
        var boosts = seasonBoosts.Current.For(cards, player.KingTowerLevel);
        var applied = options.IncludeSeasonBoosts ? boosts : null;
        var fielded = applied?.ApplyTo(cards) ?? cards;

        var lineup = await _results.GetAsync(PlayerCalculationKey.Create(player, version, options, applied),
            () => scheduler.RunAsync(token => analyzer.FindBestWarDecks(meta, fielded, options, token)), ct);
        return new PlayerWarDecks(lineup, boosts);
    }
}
