using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Stores the ladder battles any crawl comes across. A failed write is logged, not thrown: ladder data never stops a crawl.</summary>
public sealed class LadderIntake(
    LadderStore store,
    TimeProvider time,
    IOptions<LadderOptions> options,
    ILogger<LadderIntake> logger)
{
    private readonly LadderOptions _opt = options.Value;

    /// <returns>How many sides were new.</returns>
    public int Store(IReadOnlyCollection<LadderBattle> found)
    {
        var cutoff = Cutoff();
        var fresh = found.Where(b => b.BattleTimeMs >= cutoff).ToList();
        try
        {
            return store.Merge(fresh);
        }
        catch (SqliteException ex)
        {
            logger.LogError(ex, "Couldn't store {Count} ladder battle sides", fresh.Count);
            return 0;
        }
    }

    public void PruneAndReport(string source, int found, int added)
    {
        try
        {
            var pruned = store.Prune(Cutoff());
            var counts = store.Counts();
            logger.LogInformation(
                "Ladder battles from the {Source}: {Found} sides found, +{Added} new, {Pruned} pruned; "
                + "stored per {Width} trophies: {@PerTrophyBand}, per Ranked league: {@PerRankedLeague}",
                source, found, added, pruned, _opt.TrophyBandWidth, counts.PerTrophyBand, counts.PerRankedLeague);
        }
        catch (SqliteException ex)
        {
            logger.LogError(ex, "Couldn't prune or count the ladder battles");
        }
    }

    private long Cutoff() => time.GetUtcNow().ToUnixTimeMilliseconds() - _opt.RetentionMs;
}
