using Microsoft.EntityFrameworkCore;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Data;

public sealed record StoredDuelLevelFits(long FittedAtMs, long LatestRoundMs, IReadOnlyList<DuelLevelFit> Fits);

public sealed class DuelLevelFitRepository(MetaDbContext db)
{
    public async Task SaveAsync(StoredDuelLevelFits fits, CancellationToken ct = default)
    {
        await MetaWriteGate.Instance.WaitAsync(ct);
        try
        {
            db.DuelLevelFits.AddRange(fits.Fits.Select(f => ToEntity(fits, f)));
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            MetaWriteGate.Instance.Release();
        }
    }

    public IReadOnlyList<StoredDuelLevelFits> History(int refits)
    {
        var times = db.DuelLevelFits.Select(f => f.FittedAtMs).Distinct().OrderByDescending(t => t).Take(refits).ToList();
        return db.DuelLevelFits
            .AsNoTracking()
            .Where(f => times.Contains(f.FittedAtMs))
            .AsEnumerable()
            .GroupBy(f => (f.FittedAtMs, f.LatestRoundMs))
            .OrderByDescending(g => g.Key.FittedAtMs)
            .Select(g => new StoredDuelLevelFits(g.Key.FittedAtMs, g.Key.LatestRoundMs, g.OrderBy(f => f.Cap).Select(ToFit).ToList()))
            .ToList();
    }

    public StoredDuelLevelFits? Latest()
    {
        var fittedAtMs = db.DuelLevelFits.Select(f => (long?)f.FittedAtMs).Max();
        if (fittedAtMs is not { } latest)
        {
            return null;
        }
        var rows = db.DuelLevelFits.AsNoTracking().Where(f => f.FittedAtMs == latest).OrderBy(f => f.Cap).ToList();
        return new StoredDuelLevelFits(latest, rows[0].LatestRoundMs, rows.Select(ToFit).ToList());
    }

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

    private static DuelLevelFit ToFit(DuelLevelFitEntity e) => new(
        e.Cap,
        e.Duels,
        new Estimate(e.PerLevel, e.PerLevelError),
        new Estimate(e.WeakestCard, e.WeakestCardError),
        new Estimate(e.Evo, e.EvoError),
        new Estimate(e.Hero, e.HeroError));
}
