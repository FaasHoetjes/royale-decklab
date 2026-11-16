using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class SeasonBoostScheduleTests
{
    private static readonly long Hour = (long)TimeSpan.FromHours(1).TotalMilliseconds;
    private static readonly long Interval = 12 * Hour;
    private static readonly long PatchStart = new DateTimeOffset(2026, 12, 7, 9, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();

    [Fact]
    public void ANewPatch_IsCheckedAFewHoursIn_EvenWhenTheLastCheckWasRecent()
    {
        var lastCheck = PatchStart - Hour;

        Assert.Equal(PatchStart + 3 * Hour, SeasonBoostWatchService.NextCheckMs(lastCheck, PatchStart, Interval));
    }

    [Fact]
    public void ACheckRightAfterThePatch_DoesNotCountAsTheFirstCheckOfIt()
    {
        var lastCheck = PatchStart + Hour;

        Assert.Equal(PatchStart + 3 * Hour, SeasonBoostWatchService.NextCheckMs(lastCheck, PatchStart, Interval));
    }

    [Fact]
    public void OnceThePatchWasChecked_TheNextCheckWaitsTheInterval()
    {
        var lastCheck = PatchStart + 3 * Hour;

        Assert.Equal(lastCheck + Interval, SeasonBoostWatchService.NextCheckMs(lastCheck, PatchStart, Interval));
    }
}
