using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class CrownSeriesDeckCache(
    DeckAnalyzer analyzer,
    CalculationScheduler scheduler,
    CrownSeriesMeta meta,
    TimeProvider clock)
{
    // A Crown Series Duel is played with a lineup of four decks, of which a best-of-three uses two or three.
    public const int DuelDecks = 4;

    private readonly CalculationCache<WarDeckResult> _results = new(clock);

    public Task<WarDeckResult> GetAsync(CrPlayer player, CrownSeriesLeague league, LineupOptions options, CancellationToken ct = default)
    {
        var cards = player.Cards!.Select(c => c.ToPlayerItemLevel()).ToCardMap();
        var current = meta.Current;
        var duelOptions = options with { DeckCount = DuelDecks, MinLevel = null };
        var key = $"{league}|{PlayerCalculationKey.Create(player, current.Version, duelOptions)}";
        return _results.GetAsync(key,
            () => scheduler.RunAsync(token => analyzer.FindBestCrownSeriesDecks(current.ForCap(league.LevelCap()).Decks, cards, league, duelOptions, current.Values, token)), ct);
    }
}
