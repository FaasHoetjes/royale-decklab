using RoyaleDeckLab.Api.Data;

namespace RoyaleDeckLab.Api.Services;

public enum DuelLevelRefitOutcome
{
    AlreadyFitted,
    NoNewRounds,
    TooFewDuels,
    Saved,
}

public sealed record DuelLevelRefitResult(
    DuelLevelRefitOutcome Levels,
    DuelLevelRefitOutcome Cushion,
    IReadOnlyList<DuelLevelFit> Fits,
    IReadOnlyList<DuelCushionFit> Cushions);

/// <summary>Refits the level values and the deck cushion each week, each on its own, so one failing doesn't hold back the other.</summary>
public sealed class DuelLevelRefit(CrownSeriesRepository rounds, DuelLevelFitRepository fits)
{
    public async Task<DuelLevelRefitResult> RunAsync(long dueMs, long nowMs, IReadOnlySet<int> champions, CancellationToken ct = default)
    {
        // Without new rounds a fit would come out the same.
        var latestRoundMs = rounds.LatestBattleTimeMs();
        var levelsDue = Due(fits.LatestLevelRefit(), dueMs, latestRoundMs);
        var cushionDue = Due(fits.LatestCushionRefit(), dueMs, latestRoundMs);
        if (levelsDue is not null && cushionDue is not null)
        {
            return new(levelsDue.Value, cushionDue.Value, [], []);
        }

        var duels = rounds.ReadDuels();
        var fitted = levelsDue is null ? DuelLevelFitter.Fit(duels, champions) : [];
        var cushions = cushionDue is null ? DuelCushionFitter.Fit(duels) : [];
        if (fitted.Count > 0 || cushions.Count > 0)
        {
            await fits.SaveAsync(new StoredDuelLevelFits(nowMs, latestRoundMs, fitted, cushions), ct);
        }
        return new(
            levelsDue ?? Fitted(fitted.Count),
            cushionDue ?? Fitted(cushions.Count),
            fitted,
            cushions);
    }

    private static DuelLevelRefitOutcome? Due(StoredRefit? last, long dueMs, long latestRoundMs) => last switch
    {
        { FittedAtMs: var at } when at >= dueMs => DuelLevelRefitOutcome.AlreadyFitted,
        { LatestRoundMs: var seen } when latestRoundMs <= seen => DuelLevelRefitOutcome.NoNewRounds,
        _ => null,
    };

    private static DuelLevelRefitOutcome Fitted(int count) => count > 0 ? DuelLevelRefitOutcome.Saved : DuelLevelRefitOutcome.TooFewDuels;
}
