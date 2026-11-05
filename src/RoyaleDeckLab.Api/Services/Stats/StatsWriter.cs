namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>Writes queued stats events in batches, and hourly rolls expired days into totals.</summary>
public sealed class StatsWriter(StatsRecorder recorder, StatsStore store, TimeProvider clock, ILogger<StatsWriter> logger) : BackgroundService
{
    private const int BatchSize = 500;

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
        => Task.WhenAll(WriteAsync(stoppingToken), MaintainAsync(stoppingToken));

    private async Task WriteAsync(CancellationToken stoppingToken)
    {
        var queue = recorder.Queue;
        var batch = new List<StatsEvent>(BatchSize);
        try
        {
            while (await queue.WaitToReadAsync(stoppingToken))
            {
                while (batch.Count < BatchSize && queue.TryRead(out var e))
                {
                    batch.Add(e);
                }
                Flush(batch);
            }
        }
        catch (OperationCanceledException)
        {
            while (queue.TryRead(out var e))
            {
                batch.Add(e);
            }
            Flush(batch);
        }
    }

    private void Flush(List<StatsEvent> batch)
    {
        if (batch.Count == 0)
        {
            return;
        }
        try
        {
            store.Add(batch);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Couldn't write {Count} stats events", batch.Count);
        }
        batch.Clear();
    }

    private async Task MaintainAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1), clock);
        do
        {
            try
            {
                store.Maintain(DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Stats maintenance failed");
            }
        }
        while (await WaitAsync(timer, stoppingToken));
    }

    private static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken stoppingToken)
    {
        try
        {
            return await timer.WaitForNextTickAsync(stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }
}
