using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

public sealed class CrownSeriesRefreshService(
    IServiceScopeFactory scopeFactory,
    CrownSeriesMeta meta,
    CrownSeriesSchedule schedule,
    TimeProvider time,
    IOptions<CrownSeriesOptions> options,
    ILogger<CrownSeriesRefreshService> logger) : BackgroundService
{
    private readonly CrownSeriesOptions _opt = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMilliseconds(_opt.PollIntervalMs);
        try
        {
            var rounds = ReadStoredRounds();
            await RebuildMetaAsync(roundsChanged: true, rounds, stoppingToken);
            RestoreSchedule(rounds);
            rounds = null;
            var firstPoll = FirstPollDelay();
            logger.LogInformation("Crown Series poll scheduled every {Minutes} min, first in {FirstMinutes:F0} min",
                interval.TotalMinutes, firstPoll.TotalMinutes);
            await Task.Delay(firstPoll, time, stoppingToken);

            using var timer = new PeriodicTimer(interval, time);
            do
            {
                var roundsChanged = await PollAsync(stoppingToken);
                await RebuildMetaAsync(roundsChanged, rounds: null, stoppingToken);
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    /// <summary>A deploy waits out the rest of the interval since the last poll, rather than reading every log again.</summary>
    private TimeSpan FirstPollDelay()
    {
        using var scope = scopeFactory.CreateScope();
        var lastPollMs = scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().GetLastPollMs();
        var nowMs = time.GetUtcNow().ToUnixTimeMilliseconds();
        var untilDueMs = lastPollMs + _opt.PollIntervalMs - nowMs;
        return TimeSpan.FromMilliseconds(Math.Max(_opt.StartupDelayMs, untilDueMs));
    }

    // Read once at startup for both the decks and the schedule; null when the store can't be read, which leaves the
    // rebuild to try reading it itself.
    private IReadOnlyList<CappedBattle>? ReadStoredRounds()
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            return scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().ReadRoundsWithCaps();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Reading the stored Crown Series rounds failed");
            return null;
        }
    }

    // A schedule that can't be restored leaves the poll to start from the Ranked players and seeds, as on a first run.
    private void RestoreSchedule(IReadOnlyList<CappedBattle>? rounds)
    {
        if (rounds is null)
        {
            return;
        }
        try
        {
            schedule.Restore(rounds, time.GetUtcNow().ToUnixTimeMilliseconds());
            logger.LogInformation("Crown Series schedule restored: {Tracked} players tracked; per cap: {@PlayersPerCap}",
                schedule.KnownPlayers, schedule.PlayersPerCap());
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Crown Series schedule restore failed");
        }
    }

    // A failed poll is logged and the next one tries again, so one bad hour doesn't stop the collection. It may have
    // stored rounds before failing, so it counts as a change.
    private async Task<bool> PollAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<CrownSeriesCollector>().CollectAsync(ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Crown Series poll failed");
            return true;
        }
    }

    // Also run at startup: a deploy between Duel weekends still serves the last weekend's decks.
    private async Task RebuildMetaAsync(bool roundsChanged, IReadOnlyList<CappedBattle>? rounds, CancellationToken ct)
    {
        try
        {
            await meta.RebuildAsync(roundsChanged, rounds, ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Crown Series meta rebuild failed");
        }
    }
}
