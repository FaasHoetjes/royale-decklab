using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

public sealed class CrownSeriesRefreshService(
    IServiceScopeFactory scopeFactory,
    IOptions<CrownSeriesOptions> options,
    ILogger<CrownSeriesRefreshService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMilliseconds(options.Value.PollIntervalMs);
        logger.LogInformation("Crown Series poll scheduled every {Minutes} min", interval.TotalMinutes);
        try
        {
            using var timer = new PeriodicTimer(interval);
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
