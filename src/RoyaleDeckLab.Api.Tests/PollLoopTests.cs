using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services.Crawling;

namespace RoyaleDeckLab.Api.Tests;

public sealed class PollLoopTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 12, 0, 0, TimeSpan.Zero);
    private static readonly LadderOptions Options = new();

    private sealed class Clock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static TimeSpan FirstPollDelay(TimeSpan sinceLastPoll)
        => PollLoop.FirstPollDelay((Now - sinceLastPoll).ToUnixTimeMilliseconds(), Options, new Clock());

    [Fact]
    public void A_restart_waits_out_the_rest_of_the_interval()
        => Assert.Equal(TimeSpan.FromMinutes(40), FirstPollDelay(TimeSpan.FromMinutes(20)));

    [Fact]
    public void A_restart_long_after_the_last_poll_waits_only_the_startup_delay()
        => Assert.Equal(TimeSpan.FromMilliseconds(Options.StartupDelayMs), FirstPollDelay(TimeSpan.FromDays(2)));

    [Fact]
    public void A_last_poll_stored_while_the_clock_ran_ahead_waits_no_longer_than_one_interval()
        => Assert.Equal(TimeSpan.FromMilliseconds(Options.PollIntervalMs), FirstPollDelay(-TimeSpan.FromDays(60)));
}
