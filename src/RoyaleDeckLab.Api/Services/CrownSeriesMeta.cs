using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <param name="Rounds">The rounds played at this cap; the decks also count other caps' rounds, weighted less.</param>
public sealed record CrownSeriesCapMeta(IReadOnlyList<DeckMeta> Decks, int Rounds)
{
    public static CrownSeriesCapMeta Empty { get; } = new([], 0);
}

public sealed record CrownSeriesMetaSnapshot(IReadOnlyDictionary<int, CrownSeriesCapMeta> ByCap, int Rounds, long Version)
{
    public static CrownSeriesMetaSnapshot Empty { get; } = new(new Dictionary<int, CrownSeriesCapMeta>(), 0, 0);

    public CrownSeriesCapMeta ForCap(int cap) => ByCap.GetValueOrDefault(cap) ?? CrownSeriesCapMeta.Empty;
}

/// <summary>Duel decks for each league cap, ranked by how they did in the stored Crown Series rounds.</summary>
public sealed class CrownSeriesMeta(
    IServiceScopeFactory scopeFactory,
    IOptions<CrownSeriesOptions> options,
    ILogger<CrownSeriesMeta> logger)
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
            var rounds = store.ReadRoundsWithCaps();

            var byCap = new Dictionary<int, CrownSeriesCapMeta>();
            foreach (var cap in CrownSeriesCaps.All)
            {
                ct.ThrowIfCancellationRequested();
                byCap[cap] = BuildCap(builder, rounds, cap, patchStartMs);
            }
            Volatile.Write(ref _current, new CrownSeriesMetaSnapshot(byCap, rounds.Count, Current.Version + 1));
            logger.LogInformation("Crown Series meta from {Rounds} rounds; rounds per cap: {@RoundsPerCap}",
                rounds.Count, byCap.ToDictionary(c => c.Key, c => c.Value.Rounds));
        }
        finally
        {
            _rebuildGate.Release();
        }
    }

    /// <summary>
    /// A cap with few rounds of its own leans on the caps next to it: each cap further away counts
    /// <see cref="CrownSeriesOptions.OtherCapWeight"/> times less. One weekend of data couldn't yet show caps favouring
    /// different decks, so this stays a setting rather than a fitted value.
    /// </summary>
    private CrownSeriesCapMeta BuildCap(MetaBuilder builder, IReadOnlyList<CappedBattle> rounds, int cap, long patchStartMs)
    {
        var weight = options.Value.OtherCapWeight;
        var weighted = rounds
            .Select(r => (r.Record, Weight: r.Cap == cap ? 1.0 : Math.Pow(weight, Math.Abs(r.Cap - cap))))
            .Where(r => r.Weight > 0);
        var decks = builder.AggregateWeightedBattles(weighted, patchStartMs, DuelPriorWinRate);

        var ownRounds = rounds.Where(r => r.Cap == cap).ToList();
        var ownUses = ownRounds
            .GroupBy(r => string.Join(',', r.Record.CardIds))
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal);
        var withOwnUses = decks
            .Select(d => WithLeagueUses(d, ownUses.GetValueOrDefault(string.Join(',', d.CardIds))))
            .ToList();
        return new CrownSeriesCapMeta(withOwnUses, ownRounds.Count);
    }

    private static DeckMeta WithLeagueUses(DeckMeta deck, int leagueUses) => new()
    {
        CardIds = deck.CardIds,
        WinRate = deck.WinRate,
        Confidence = deck.Confidence,
        Uses = deck.Uses,
        LeagueUses = leagueUses,
        Players = deck.Players,
        PickRate = deck.PickRate,
        CardVersions = deck.CardVersions,
    };
}
