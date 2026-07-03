using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Loads the meta cache on startup, then keeps it fresh on a timer. Players who
/// generate decks after each refresh pick up the new data automatically
/// (handlers read MetaCache live).
/// </summary>
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
            // Initial load/build. The server is already accepting requests; until
            // this finishes, meta-dependent responses just return an empty meta.
            await cache.InitializeAsync(stoppingToken);

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
            // Normal shutdown.
        }
    }
}
