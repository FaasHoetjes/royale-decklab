using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class CrownSeriesDeckCache(
    DeckAnalyzer analyzer,
    CalculationScheduler scheduler,
    CrownSeriesMeta meta,
    TimeProvider clock)
{
    private readonly CalculationCache<WarDeckResult> _results = new(clock);

    public Task<WarDeckResult> GetAsync(CrPlayer player, CrownSeriesLeague league, int deckCount, CancellationToken ct = default)
    {
        var cards = player.Cards!.Select(c => c.ToPlayerItemLevel()).ToCardMap();
        var current = meta.Current;
        var key = $"{league}|{PlayerCalculationKey.Create(player, current.Version, new LineupOptions { DeckCount = deckCount })}";
        return _results.GetAsync(key,
            () => scheduler.RunAsync(token => analyzer.FindBestCrownSeriesDecks(current.Decks, cards, league, deckCount, token)), ct);
    }
}
