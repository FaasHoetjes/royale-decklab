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
    DuelLevelRefitOutcome Outcome, IReadOnlyList<DuelLevelFit> Fits, IReadOnlyList<DuelCushionFit> Cushions);

public sealed class DuelLevelRefit(CrownSeriesRepository rounds, DuelLevelFitRepository fits)
{
    public async Task<DuelLevelRefitResult> RunAsync(long dueMs, long nowMs, IReadOnlySet<int> champions, CancellationToken ct = default)
    {
        var last = fits.Latest();
        if (last is not null && last.FittedAtMs >= dueMs)
        {
            return new(DuelLevelRefitOutcome.AlreadyFitted, [], []);
        }
        // Without new rounds the fit would come out the same.
        var latestRoundMs = rounds.LatestBattleTimeMs();
        if (last is not null && latestRoundMs <= last.LatestRoundMs)
        {
            return new(DuelLevelRefitOutcome.NoNewRounds, [], []);
        }

        var duels = rounds.ReadDuels();
        var fitted = DuelLevelFitter.Fit(duels, champions);
        var cushions = DuelCushionFitter.Fit(duels);
        if (fitted.Count == 0 && cushions.Count == 0)
        {
            return new(DuelLevelRefitOutcome.TooFewDuels, [], []);
        }
        await fits.SaveAsync(new StoredDuelLevelFits(nowMs, latestRoundMs, fitted, cushions), ct);
        return new(DuelLevelRefitOutcome.Saved, fitted, cushions);
    }
}
