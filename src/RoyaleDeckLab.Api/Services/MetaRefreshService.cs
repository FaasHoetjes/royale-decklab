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
            // Initial load/build. The server is already accepting requests; the
            // cache serves stored (possibly stale) battles immediately and only
            // an empty store leaves meta-dependent responses without scores
            // until the first crawl lands.
            try
            {
                await cache.InitializeAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // An unhandled exception escaping ExecuteAsync stops the whole
                // host (BackgroundServiceExceptionBehavior.StopHost), so a
                // transient startup failure (e.g. a briefly locked DB) must not
                // bubble. The timer loop below retries on the next tick.
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
            // Normal shutdown.
        }
    }
}
