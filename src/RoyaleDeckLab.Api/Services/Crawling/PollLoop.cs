using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services.Crawling;

public static class PollLoop
{
    /// <summary>A deploy waits out the rest of the interval since the last poll, rather than reading every log again.</summary>
    public static TimeSpan FirstPollDelay(long lastPollMs, PlayerPollOptions options, TimeProvider time)
    {
        var untilDueMs = lastPollMs + options.PollIntervalMs - time.GetUtcNow().ToUnixTimeMilliseconds();
        return TimeSpan.FromMilliseconds(Math.Max(options.StartupDelayMs, untilDueMs));
    }

    public static async Task RunAsync(
        TimeSpan firstDelay, PlayerPollOptions options, TimeProvider time, Func<CancellationToken, Task> poll, CancellationToken ct)
    {
        await Task.Delay(firstDelay, time, ct);
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(options.PollIntervalMs), time);
        do
        {
            await poll(ct);
        }
        while (await timer.WaitForNextTickAsync(ct));
    }
}
