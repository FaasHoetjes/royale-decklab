using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services.Crawling;

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
        try
        {
            var rounds = ReadStoredRounds();
            await RebuildMetaAsync(roundsChanged: true, rounds, stoppingToken);
            RestoreSchedule(rounds);
            rounds = null;
            var firstPoll = FirstPollDelay();
            logger.LogInformation("Crown Series poll scheduled every {Minutes} min, first in {FirstMinutes:F0} min",
                _opt.PollIntervalMs / 60_000, firstPoll.TotalMinutes);
            await PollLoop.RunAsync(firstPoll, _opt, time, async ct =>
            {
                var roundsChanged = await PollAsync(ct);
                await RebuildMetaAsync(roundsChanged, rounds: null, ct);
            }, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private TimeSpan FirstPollDelay()
    {
        using var scope = scopeFactory.CreateScope();
        var lastPollMs = scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().GetLastPollMs();
        return PollLoop.FirstPollDelay(lastPollMs, _opt, time);
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
