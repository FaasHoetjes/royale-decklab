using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <param name="Rounds">The stored rounds at this cap, one per player side, so each round played counts twice.</param>
/// <param name="BorrowedRounds">The other caps' stored rounds the decks count, as weighted.</param>
public sealed record CrownSeriesCapMeta(IReadOnlyList<DeckMeta> Decks, int Rounds, double BorrowedRounds = 0)
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

    // Shown to the player as their win chance, so it is the deck's likeliest win rate rather than the cautious one.
    // Weekend 1 predicting weekend 2 (Nov 2026, 64k rounds): the cautious value came out 5 points low, the median
    // within 2, and the median's top decks per cap went on to win more than the cautious ones' did.
    private const double DuelRankingQuantile = 0.5;

    private readonly SemaphoreSlim _rebuildGate = new(1, 1);
    private CrownSeriesMetaSnapshot _current = CrownSeriesMetaSnapshot.Empty;
    private long _builtPatchStartMs;

    public CrownSeriesMetaSnapshot Current => Volatile.Read(ref _current);

    public bool IsBuilt => Current.Version > 0;

    public Task RebuildAsync(CancellationToken ct = default) => RebuildAsync(roundsChanged: true, rounds: null, ct);

    /// <summary>
    /// Builds the decks again when the stored rounds changed or a new patch started, which reweighs them; a new
    /// build also drops every player's cached lineup.
    /// </summary>
    /// <param name="rounds">The stored rounds, when the caller already read them; read from the store otherwise.</param>
    public async Task RebuildAsync(bool roundsChanged, IReadOnlyList<CappedBattle>? rounds, CancellationToken ct = default)
    {
        await _rebuildGate.WaitAsync(ct);
        try
        {
            using var scope = scopeFactory.CreateScope();
            var patchStartMs = scope.ServiceProvider.GetRequiredService<BattleRepository>().GetEpochStart();
            if (!roundsChanged && IsBuilt && patchStartMs == _builtPatchStartMs)
            {
                return;
            }
            var store = scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>();
            var builder = scope.ServiceProvider.GetRequiredService<MetaBuilder>();
            rounds ??= store.ReadRoundsWithCaps();
            var roundsPerCap = rounds
                .GroupBy(r => r.Cap)
                .ToDictionary(g => g.Key, g => g.Count());

            var byCap = new Dictionary<int, CrownSeriesCapMeta>();
            foreach (var cap in CrownSeriesCaps.All)
            {
                ct.ThrowIfCancellationRequested();
                byCap[cap] = BuildCap(builder, rounds, roundsPerCap, cap, patchStartMs);
            }
            Volatile.Write(ref _current, new CrownSeriesMetaSnapshot(byCap, rounds.Count, Current.Version + 1));
            _builtPatchStartMs = patchStartMs;
            logger.LogInformation("Crown Series meta from {Rounds} rounds; rounds per cap: {@RoundsPerCap}",
                rounds.Count, byCap.ToDictionary(c => c.Key, c => c.Value.Rounds));
        }
        finally
        {
            _rebuildGate.Release();
        }
    }

    /// <summary>
    /// A cap with few rounds of its own leans on the caps next to it, as <see cref="CrownSeriesBorrowing"/> weighs them.
    /// One weekend of data couldn't yet show caps favouring different decks, so the weights stay settings rather than
    /// fitted values.
    /// </summary>
    private CrownSeriesCapMeta BuildCap(
        MetaBuilder builder, IReadOnlyList<CappedBattle> rounds, IReadOnlyDictionary<int, int> roundsPerCap, int cap, long patchStartMs)
    {
        var capWeights = CrownSeriesBorrowing.WeightsFor(
            cap, roundsPerCap, options.Value.OtherCapWeight, options.Value.MinBorrowedRounds);
        var weighted = rounds
            .Select(r => (r.Record, Weight: capWeights.GetValueOrDefault(r.Cap)))
            .Where(r => r.Weight > 0);
        var decks = builder.AggregateWeightedBattles(weighted, patchStartMs, DuelPriorWinRate, DuelRankingQuantile);

        var ownRounds = rounds.Where(r => r.Cap == cap).ToList();
        var ownUses = ownRounds
            .GroupBy(r => string.Join(',', r.Record.CardIds))
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal);
        var withOwnUses = decks
            .Select(d => WithLeagueUses(d, ownUses.GetValueOrDefault(string.Join(',', d.CardIds))))
            .ToList();
        var borrowedRounds = rounds
            .Where(r => r.Cap != cap)
            .Sum(r => capWeights.GetValueOrDefault(r.Cap));
        return new CrownSeriesCapMeta(withOwnUses, ownRounds.Count, borrowedRounds);
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
