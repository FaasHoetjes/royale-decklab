using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <param name="Sides">The range's own stored sides; each battle within it counts twice.</param>
/// <param name="BorrowedSides">The other ranges' sides the decks count, as weighted.</param>
/// <param name="OpponentLevel">The average card level of the decks played in the range.</param>
public sealed record LadderRangeMeta(IReadOnlyList<DeckMeta> Decks, int Sides, double BorrowedSides, double OpponentLevel);

public sealed record LadderMetaSnapshot(IReadOnlyDictionary<LadderGroup, LadderRangeMeta> ByGroup, long Version)
{
    public static LadderMetaSnapshot Empty { get; } = new(new Dictionary<LadderGroup, LadderRangeMeta>(), 0);

    /// <summary>The group's decks, or the nearest group's in the same mode when it has none built.</summary>
    public (LadderGroup Group, LadderRangeMeta Meta)? For(LadderGroup group)
    {
        if (ByGroup.TryGetValue(group, out var own))
        {
            return (group, own);
        }
        var nearest = ByGroup.Keys
            .Where(g => g.Mode == group.Mode)
            .OrderBy(g => Math.Abs(g.Floor - group.Floor))
            .ThenByDescending(g => g.Floor)
            .Cast<LadderGroup?>()
            .FirstOrDefault();
        return nearest is { } found ? (found, ByGroup[found]) : null;
    }
}

/// <summary>
/// Trophy Road and Ranked decks for each range and league, ranked by how they did once each battle's level gap is
/// taken out, so a deck isn't credited for being played by players with higher levels.
/// </summary>
public sealed class LadderMeta(
    IServiceScopeFactory scopeFactory,
    LadderStore store,
    TimeProvider time,
    IOptions<LadderOptions> options,
    IOptions<MetaOptions> metaOptions,
    ILogger<LadderMeta> logger)
{
    // Every battle has a winner and a loser, so the average deck wins half once levels are taken out.
    private const double PriorWinRate = 0.5;
    private const int CancelCheckEvery = 10_000;

    private readonly LadderOptions _opt = options.Value;
    private readonly SemaphoreSlim _rebuildGate = new(1, 1);
    private LadderMetaSnapshot _current = LadderMetaSnapshot.Empty;

    public LadderMetaSnapshot Current => Volatile.Read(ref _current);

    public bool IsBuilt => Current.Version > 0;

    public async Task RebuildAsync(CancellationToken ct = default)
    {
        await _rebuildGate.WaitAsync(ct);
        try
        {
            using var scope = scopeFactory.CreateScope();
            var patchStartMs = scope.ServiceProvider.GetRequiredService<BattleRepository>().GetEpochStart();
            var builder = scope.ServiceProvider.GetRequiredService<MetaBuilder>();
            var counts = store.Counts();
            var sinceMs = time.GetUtcNow().ToUnixTimeMilliseconds() - _opt.RetentionMs;

            var byGroup = new Dictionary<LadderGroup, LadderRangeMeta>();
            foreach (var (mode, perBand) in new[] { (LadderMode.TrophyRoad, counts.PerTrophyBand), (LadderMode.Ranked, counts.PerRankedLeague) })
            {
                foreach (var (group, meta) in BuildMode(mode, perBand, builder, patchStartMs, sinceMs, ct))
                {
                    byGroup[group] = meta;
                }
            }
            Volatile.Write(ref _current, new LadderMetaSnapshot(byGroup, Current.Version + 1));
            logger.LogInformation("Ladder meta built; decks per range: {@Decks}",
                byGroup.OrderBy(g => g.Key.Mode).ThenBy(g => g.Key.Floor).ToDictionary(g => g.Key.ToString(), g => g.Value.Decks.Count));
        }
        finally
        {
            _rebuildGate.Release();
        }
    }

    /// <summary>
    /// Reads the mode's sides once and adds each to every range that borrows it, as <see cref="GroupBorrowing"/>
    /// weighs them.
    /// </summary>
    private Dictionary<LadderGroup, LadderRangeMeta> BuildMode(
        LadderMode mode, IReadOnlyDictionary<int, int> sidesPerBand, MetaBuilder builder, long patchStartMs, long sinceMs,
        CancellationToken ct)
    {
        var sidesPerGroup = new Dictionary<LadderGroup, int>();
        foreach (var (band, sides) in sidesPerBand)
        {
            if (LadderGroup.Of(mode, band, _opt) is { } group)
            {
                sidesPerGroup[group] = sides;
            }
        }
        if (sidesPerGroup.Count == 0)
        {
            return [];
        }

        var ordered = Ordered(mode, sidesPerGroup.Keys);
        var tallies = ordered.Select(_ => new RangeTally()).ToArray();
        var borrowedBy = new Dictionary<LadderGroup, List<(int Range, double Weight)>>();
        for (var i = 0; i < ordered.Count; i++)
        {
            var weights = GroupBorrowing.WeightsFor(
                ordered[i], ordered, sidesPerGroup, _opt.OtherRangeWeight, _opt.MinBorrowedSides);
            foreach (var (source, weight) in weights)
            {
                if (weight <= 0)
                {
                    continue;
                }
                if (!borrowedBy.TryGetValue(source, out var ranges))
                {
                    ranges = [];
                    borrowedBy[source] = ranges;
                }
                ranges.Add((i, weight));
            }
        }

        var read = 0;
        foreach (var side in store.ReadSides(mode, sinceMs))
        {
            if (++read % CancelCheckEvery == 0)
            {
                ct.ThrowIfCancellationRequested();
            }
            if (LadderGroup.Of(mode, side.Standing, _opt) is not { } group
                || !borrowedBy.TryGetValue(group, out var ranges))
            {
                continue;
            }

            var (cardIds, versions) = LadderDeck.Parse(side.Deck);
            var winShare = side.Result.WinShare() - LadderLevels.ExpectedWinShare(side.Levels, side.OpponentLevels) + 0.5;
            var patchWeight = builder.PatchWeight(side.BattleTimeMs, patchStartMs);
            var level = LadderLevels.Mean(side.Levels);
            foreach (var (range, weight) in ranges)
            {
                var tally = tallies[range];
                tally.Decks.Add(cardIds, versions, side.BattleTimeMs, side.PlayerTag, weight * patchWeight, winShare);
                tally.LevelSum += weight * level;
                tally.Weight += weight;
                if (!ordered[range].Equals(group))
                {
                    tally.Borrowed += weight;
                }
            }
        }

        var metaOpt = metaOptions.Value;
        var built = new Dictionary<LadderGroup, LadderRangeMeta>();
        for (var i = 0; i < ordered.Count; i++)
        {
            var tally = tallies[i];
            built[ordered[i]] = new LadderRangeMeta(
                tally.Decks.Build(metaOpt.PriorGames, PriorWinRate, metaOpt.RankingQuantile),
                sidesPerGroup.GetValueOrDefault(ordered[i]),
                tally.Borrowed,
                tally.Weight > 0 ? tally.LevelSum / tally.Weight : LevelModel.MaxDisplayLevel);
        }
        return built;
    }

    /// <summary>Every range from the lowest stored to the highest, empty ones included, so each step counts as one.</summary>
    private List<LadderGroup> Ordered(LadderMode mode, IEnumerable<LadderGroup> stored)
    {
        var floors = stored.Select(g => g.Floor).ToList();
        var step = mode == LadderMode.TrophyRoad ? _opt.TrophyBandWidth : 1;
        var ordered = new List<LadderGroup>();
        for (var floor = floors.Min(); floor <= floors.Max(); floor += step)
        {
            ordered.Add(new LadderGroup(mode, floor));
        }
        return ordered;
    }

    private sealed class RangeTally
    {
        public DeckTally Decks { get; } = new();
        public double LevelSum;
        public double Weight;
        public double Borrowed;
    }
}
