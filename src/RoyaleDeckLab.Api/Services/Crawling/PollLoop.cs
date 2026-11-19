using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services.Crawling;

public static class PollLoop
{
    /// <summary>
    /// A deploy waits out the rest of the interval since the last poll, rather than reading every log again. The cap
    /// keeps a last poll stored while the clock ran ahead from holding the poll back.
    /// </summary>
    public static TimeSpan FirstPollDelay(long lastPollMs, PlayerPollOptions options, TimeProvider time)
    {
        var untilDueMs = lastPollMs + options.PollIntervalMs - time.GetUtcNow().ToUnixTimeMilliseconds();
        var longest = Math.Max(options.StartupDelayMs, options.PollIntervalMs);
        return TimeSpan.FromMilliseconds(Math.Clamp(untilDueMs, options.StartupDelayMs, longest));
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
