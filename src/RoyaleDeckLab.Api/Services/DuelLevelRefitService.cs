using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

// Tuesday morning, so the fit takes in the whole Crown Series weekend that ended on Monday.
public sealed class DuelLevelRefitService(
    IServiceScopeFactory scopeFactory,
    CardCatalog catalog,
    TimeProvider clock,
    ILogger<DuelLevelRefitService> logger) : BackgroundService
{
    private static readonly TimeSpan FitTimeOfDay = TimeSpan.FromHours(6);
    private static readonly TimeSpan StartupDelay = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan Tick = TimeSpan.FromHours(1);

    private long _doneForDueMs;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(StartupDelay, clock, stoppingToken);
            while (true)
            {
                try
                {
                    await RefitIfDueAsync(stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    logger.LogError(ex, "Duel level refit failed; trying again in {Hours} h", Tick.TotalHours);
                }
                await Task.Delay(Tick, clock, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    public static DateTimeOffset LastDue(DateTimeOffset now)
    {
        var utc = now.ToUniversalTime();
        var daysSinceTuesday = ((int)utc.DayOfWeek - (int)DayOfWeek.Tuesday + 7) % 7;
        var due = new DateTimeOffset(utc.Date, TimeSpan.Zero).AddDays(-daysSinceTuesday) + FitTimeOfDay;
        return due > utc ? due.AddDays(-7) : due;
    }

    private async Task RefitIfDueAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var dueMs = LastDue(now).ToUnixTimeMilliseconds();
        if (_doneForDueMs == dueMs)
        {
            return;
        }

        using var scope = scopeFactory.CreateScope();
        var fits = scope.ServiceProvider.GetRequiredService<DuelLevelFitRepository>();
        var rounds = scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>();
        var last = fits.Latest();
        var latestRoundMs = rounds.LatestBattleTimeMs();
        if (last is not null && (last.FittedAtMs >= dueMs || latestRoundMs <= last.LatestRoundMs))
        {
            _doneForDueMs = dueMs;
            return;
        }

        var champions = (await catalog.GetAsync(ct))
            .Where(c => RarityExtensions.IsChampion(c.Rarity))
            .Select(c => c.Id)
            .ToHashSet();
        if (champions.Count == 0)
        {
            logger.LogWarning("The card catalog lists no champions; leaving the Duel level refit for the next try");
            return;
        }

        var fitted = DuelLevelFitter.Fit(rounds.ReadDuels(), champions);
        _doneForDueMs = dueMs;
        if (fitted.Count == 0)
        {
            logger.LogInformation("Too few Duels went to a third round for a level refit");
            return;
        }
        await fits.SaveAsync(new StoredDuelLevelFits(now.ToUnixTimeMilliseconds(), latestRoundMs, fitted), ct);
        foreach (var f in fitted)
        {
            logger.LogInformation(
                "Duel level refit, cap {Cap}: {Duels} Duels, level {PerLevel:F2} ± {PerLevelError:F2}, evo {Evo:F2} ± {EvoError:F2}, hero {Hero:F2} ± {HeroError:F2}",
                f.Cap == DuelLevelFitter.AllCaps ? "all" : f.Cap.ToString(System.Globalization.CultureInfo.InvariantCulture),
                f.Duels, f.PerLevel.Value, f.PerLevel.StandardError, f.Evo.Value, f.Evo.StandardError, f.Hero.Value, f.Hero.StandardError);
        }
    }
}
