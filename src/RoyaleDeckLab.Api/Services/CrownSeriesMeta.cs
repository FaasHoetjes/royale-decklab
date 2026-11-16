using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record CrownSeriesMetaSnapshot(IReadOnlyList<DeckMeta> Decks, int Rounds, long Version)
{
    public static CrownSeriesMetaSnapshot Empty { get; } = new([], 0, 0);
}

/// <summary>Duel decks ranked by how they did in the stored Crown Series rounds.</summary>
public sealed class CrownSeriesMeta(IServiceScopeFactory scopeFactory, ILogger<CrownSeriesMeta> logger)
{
    // Every round has a winner and a loser, so the average Duel deck wins half; war's prior sits above that.
    private const double DuelPriorWinRate = 0.5;

    private readonly SemaphoreSlim _rebuildGate = new(1, 1);
    private CrownSeriesMetaSnapshot _current = CrownSeriesMetaSnapshot.Empty;

    public CrownSeriesMetaSnapshot Current => Volatile.Read(ref _current);

    public async Task RebuildAsync(CancellationToken ct = default)
    {
        await _rebuildGate.WaitAsync(ct);
        try
        {
            using var scope = scopeFactory.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>();
            var builder = scope.ServiceProvider.GetRequiredService<MetaBuilder>();
            var patchStartMs = scope.ServiceProvider.GetRequiredService<BattleRepository>().GetEpochStart();
            var rounds = 0;
            var decks = builder.AggregateBattles(
                Count(store.StreamRoundsAsBattles(), () => rounds++), patchStartMs, DuelPriorWinRate);
            Volatile.Write(ref _current, new CrownSeriesMetaSnapshot(decks, rounds, Current.Version + 1));
            logger.LogInformation("Crown Series meta: {Decks} decks from {Rounds} rounds", decks.Count, rounds);
        }
        finally
        {
            _rebuildGate.Release();
        }
    }

    private static IEnumerable<T> Count<T>(IEnumerable<T> items, Action onItem)
    {
        foreach (var item in items)
        {
            onItem();
            yield return item;
        }
    }
}
