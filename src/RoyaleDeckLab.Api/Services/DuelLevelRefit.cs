using RoyaleDeckLab.Api.Data;

namespace RoyaleDeckLab.Api.Services;

public enum DuelLevelRefitOutcome
{
    AlreadyFitted,
    NoNewRounds,
    TooFewDuels,
    Saved,
}

public sealed record DuelLevelRefitResult(DuelLevelRefitOutcome Outcome, IReadOnlyList<DuelLevelFit> Fits);

public sealed class DuelLevelRefit(CrownSeriesRepository rounds, DuelLevelFitRepository fits)
{
    public async Task<DuelLevelRefitResult> RunAsync(long dueMs, long nowMs, IReadOnlySet<int> champions, CancellationToken ct = default)
    {
        var last = fits.Latest();
        if (last is not null && last.FittedAtMs >= dueMs)
        {
            return new(DuelLevelRefitOutcome.AlreadyFitted, []);
        }
        // Without new rounds the fit would come out the same.
        var latestRoundMs = rounds.LatestBattleTimeMs();
        if (last is not null && latestRoundMs <= last.LatestRoundMs)
        {
            return new(DuelLevelRefitOutcome.NoNewRounds, []);
        }

        var fitted = DuelLevelFitter.Fit(rounds.ReadDuels(), champions);
        if (fitted.Count == 0)
        {
            return new(DuelLevelRefitOutcome.TooFewDuels, []);
        }
        await fits.SaveAsync(new StoredDuelLevelFits(nowMs, latestRoundMs, fitted), ct);
        return new(DuelLevelRefitOutcome.Saved, fitted);
    }
}
