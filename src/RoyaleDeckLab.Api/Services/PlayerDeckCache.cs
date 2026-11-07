using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class PlayerDeckCache(DeckAnalyzer analyzer, CalculationScheduler scheduler, TimeProvider clock)
{
    private readonly CalculationCache<WarDeckResult> _results = new(clock);

    public Task<WarDeckResult> GetAsync(CrPlayer player, long version, IReadOnlyList<DeckMeta> meta,
        LineupOptions options, CancellationToken ct = default)
        => _results.GetAsync(PlayerCalculationKey.Create(player, version, options),
            () => scheduler.RunAsync(token => analyzer.FindBestWarDecks(meta,
                player.Cards!.Select(c => c.ToPlayerItemLevel()).ToDictionary(c => c.Id), options, token)), ct);
}
