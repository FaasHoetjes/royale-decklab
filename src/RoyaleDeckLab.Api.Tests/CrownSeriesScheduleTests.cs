using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CrownSeriesScheduleTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 12, 0, 0, TimeSpan.Zero);
    private static readonly long NowMs = Now.ToUnixTimeMilliseconds();

    private static CrownSeriesSchedule Schedule(CrownSeriesOptions? options = null)
        => new(Microsoft.Extensions.Options.Options.Create(options ?? new CrownSeriesOptions()));

    private static CrBattle Battle(TimeSpan ago, string mode = "Competitive_Multideck")
        => new("unknown", (Now - ago).UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z",
            new CrGameMode(72000513, mode), "quadDeckPick", [], []);

    [Fact]
    public void A_log_that_filled_in_two_hours_is_due_again_next_poll()
    {
        var schedule = Schedule();
        schedule.RecordRead("#A", [Battle(TimeSpan.Zero), Battle(TimeSpan.FromHours(2))], NowMs);

        Assert.True(schedule.IsDue("#A", NowMs + (long)TimeSpan.FromHours(1).TotalMilliseconds));
        Assert.True(schedule.IsDue("#NEW", NowMs));
    }

    [Fact]
    public void A_log_that_filled_in_days_waits_for_the_reread_cap()
    {
        var schedule = Schedule();
        schedule.RecordRead("#A", [Battle(TimeSpan.Zero), Battle(TimeSpan.FromDays(3))], NowMs);

        Assert.False(schedule.IsDue("#A", NowMs + (long)TimeSpan.FromHours(6).TotalMilliseconds));
        Assert.True(schedule.IsDue("#A", NowMs + (long)TimeSpan.FromHours(8).TotalMilliseconds));
    }

    [Fact]
    public void A_poll_interval_above_the_reread_cap_still_schedules_reads()
    {
        var schedule = Schedule(new CrownSeriesOptions
        {
            PollIntervalMs = (long)TimeSpan.FromHours(12).TotalMilliseconds,
            MaxRereadIntervalMs = (long)TimeSpan.FromHours(8).TotalMilliseconds,
        });

        schedule.RecordRead("#A", [], NowMs);

        Assert.False(schedule.IsDue("#A", NowMs));
    }

    [Fact]
    public void Players_who_left_the_ranked_list_and_stopped_playing_duels_are_forgotten()
    {
        var schedule = Schedule();
        var longAgo = Battle(TimeSpan.FromDays(22));
        schedule.RecordRead("#GONE", [longAgo], NowMs);
        schedule.RecordRead("#RANKED", [longAgo], NowMs);
        schedule.RecordRead("#PLAYING", [Battle(TimeSpan.FromDays(2))], NowMs);
        schedule.RecordRead("#LADDER_ONLY", [Battle(TimeSpan.FromHours(1), mode: "Ladder")], NowMs);

        schedule.ForgetInactive(["#RANKED"], NowMs);

        Assert.Equal(["#PLAYING", "#RANKED"], schedule.KnownTags().Order());
    }
}
