using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

public sealed class CrownSeriesRefreshService(
    IServiceScopeFactory scopeFactory,
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
            var firstPoll = FirstPollDelay();
            logger.LogInformation("Crown Series poll scheduled every {Minutes} min, first in {FirstMinutes:F0} min",
                interval.TotalMinutes, firstPoll.TotalMinutes);
            await Task.Delay(firstPoll, time, stoppingToken);

            using var timer = new PeriodicTimer(interval, time);
            do
            {
                await PollAsync(stoppingToken);
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

    // A failed poll is logged and the next one tries again, so one bad hour doesn't stop the collection.
    private async Task PollAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            await scope.ServiceProvider.GetRequiredService<CrownSeriesCollector>().CollectAsync(ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Crown Series poll failed");
        }
    }
}
