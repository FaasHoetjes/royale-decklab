using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

public sealed class MetaRefreshService(
    MetaCache cache,
    IOptions<MetaOptions> options,
    ILogger<MetaRefreshService> logger) : BackgroundService
{
    private readonly MetaOptions _opt = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            try
            {
                await cache.InitializeAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Initial meta load failed; retrying on the refresh interval");
            }

            var interval = TimeSpan.FromMilliseconds(_opt.BackgroundRefreshIntervalMs);
            logger.LogInformation("Background meta refresh scheduled every {Minutes} min", interval.TotalMinutes);

            using var timer = new PeriodicTimer(interval);
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await cache.RebuildAsync("background refresh", stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }
}
