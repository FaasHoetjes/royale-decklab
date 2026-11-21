using Microsoft.EntityFrameworkCore;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Data;

public sealed record StoredDuelLevelFits(
    long FittedAtMs, long LatestRoundMs, IReadOnlyList<DuelLevelFit> Fits, IReadOnlyList<DuelCushionFit> Cushions);

public sealed class DuelLevelFitRepository(MetaDbContext db)
{
    public async Task SaveAsync(StoredDuelLevelFits fits, CancellationToken ct = default)
    {
        await MetaWriteGate.Instance.WaitAsync(ct);
        try
        {
            db.DuelLevelFits.AddRange(fits.Fits.Select(f => ToEntity(fits, f)));
            db.DuelCushionFits.AddRange(fits.Cushions.Select(c => ToEntity(fits, c)));
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            MetaWriteGate.Instance.Release();
        }
    }

    public IReadOnlyList<StoredDuelLevelFits> History(int refits)
    {
        var times = db.DuelLevelFits.Select(f => f.FittedAtMs)
            .Union(db.DuelCushionFits.Select(c => c.FittedAtMs))
            .OrderByDescending(t => t)
            .Take(refits)
            .ToList();
        var levels = db.DuelLevelFits.AsNoTracking().Where(f => times.Contains(f.FittedAtMs)).ToList();
        var cushions = db.DuelCushionFits.AsNoTracking().Where(c => times.Contains(c.FittedAtMs)).ToList();
        return times
            .Select(t =>
            {
                var levelRows = levels.Where(f => f.FittedAtMs == t).OrderBy(f => f.Cap).ToList();
                var cushionRows = cushions.Where(c => c.FittedAtMs == t).OrderBy(c => c.Cap).ToList();
                var latestRoundMs = levelRows.Select(f => f.LatestRoundMs).Concat(cushionRows.Select(c => c.LatestRoundMs)).Max();
                return new StoredDuelLevelFits(t, latestRoundMs, levelRows.Select(ToFit).ToList(), cushionRows.Select(ToFit).ToList());
            })
            .ToList();
    }

    public StoredDuelLevelFits? Latest() => History(1).FirstOrDefault();

    private static DuelLevelFitEntity ToEntity(StoredDuelLevelFits fits, DuelLevelFit f) => new()
    {
        FittedAtMs = fits.FittedAtMs,
        Cap = f.Cap,
        LatestRoundMs = fits.LatestRoundMs,
        Duels = f.Duels,
        PerLevel = f.PerLevel.Value,
        PerLevelError = f.PerLevel.StandardError,
        WeakestCard = f.WeakestCard.Value,
        WeakestCardError = f.WeakestCard.StandardError,
        Evo = f.Evo.Value,
        EvoError = f.Evo.StandardError,
        Hero = f.Hero.Value,
        HeroError = f.Hero.StandardError,
    };

    private static DuelCushionFitEntity ToEntity(StoredDuelLevelFits fits, DuelCushionFit c) => new()
    {
        FittedAtMs = fits.FittedAtMs,
        Cap = c.Cap,
        LatestRoundMs = fits.LatestRoundMs,
        Decks = c.Decks,
        Rounds = c.Rounds,
        Spread = c.Spread,
        PriorRounds = c.PriorRounds,
    };

    private static DuelLevelFit ToFit(DuelLevelFitEntity e) => new(
        e.Cap,
        e.Duels,
        new Estimate(e.PerLevel, e.PerLevelError),
        new Estimate(e.WeakestCard, e.WeakestCardError),
        new Estimate(e.Evo, e.EvoError),
        new Estimate(e.Hero, e.HeroError));

    private static DuelCushionFit ToFit(DuelCushionFitEntity e) => new(e.Cap, e.Decks, e.Rounds, e.Spread, e.PriorRounds);
}
