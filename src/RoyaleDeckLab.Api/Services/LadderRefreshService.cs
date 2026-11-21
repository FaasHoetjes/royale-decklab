using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services.Crawling;

namespace RoyaleDeckLab.Api.Services;

public sealed class LadderRefreshService(
    IServiceScopeFactory scopeFactory,
    LadderStore store,
    LadderMeta ladderMeta,
    MetaCache meta,
    TimeProvider time,
    IOptions<LadderOptions> options,
    ILogger<LadderRefreshService> logger) : BackgroundService
{
    private static readonly TimeSpan RebuildCheckInterval = TimeSpan.FromMinutes(1);

    private readonly LadderOptions _opt = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            RestoreSchedule();
            await RebuildMetaAsync(stoppingToken);
            var firstPoll = PollLoop.FirstPollDelay(LastPollMs(), _opt, time);
            logger.LogInformation("Ladder poll scheduled every {Minutes} min, first in {FirstMinutes:F0} min",
                _opt.PollIntervalMs / 60_000, firstPoll.TotalMinutes);
            await PollLoop.RunAsync(firstPoll, _opt, time, PollAsync, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task PollAsync(CancellationToken ct)
    {
        while (meta.IsBuilding)
        {
            await Task.Delay(RebuildCheckInterval, time, ct);
        }
        try
        {
            using var scope = scopeFactory.CreateScope();
            await scope.ServiceProvider.GetRequiredService<LadderCollector>().CollectAsync(ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Ladder poll failed");
        }
        await RebuildMetaAsync(ct);
    }

    private async Task RebuildMetaAsync(CancellationToken ct)
    {
        try
        {
            await ladderMeta.RebuildAsync(ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Ladder meta rebuild failed");
        }
    }

    private long LastPollMs()
    {
        try
        {
            return store.GetLastPollMs();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Couldn't read when the last ladder poll ran");
            return 0;
        }
    }

    // A schedule that can't be restored leaves the poll to start from seeds, as on a first run.
    private void RestoreSchedule()
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            scope.ServiceProvider.GetRequiredService<LadderCollector>().RestoreSchedule();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Ladder schedule restore failed");
        }
    }
}
