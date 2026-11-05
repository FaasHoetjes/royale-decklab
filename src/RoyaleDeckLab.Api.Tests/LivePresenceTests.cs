using RoyaleDeckLab.Api.Services.Stats;

namespace RoyaleDeckLab.Api.Tests;

public sealed class LivePresenceTests
{
    private static readonly DateTimeOffset Noon = new(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = DateOnly.FromDateTime(Noon.UtcDateTime);

    private readonly Clock _clock = new(Noon);
    private readonly LivePresence _presence;

    public LivePresenceTests() => _presence = new LivePresence(_clock);

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static byte[] Visitor(int n) => [.. Enumerable.Repeat((byte)n, 16)];

    private LivePresence.Tab Open(int visitor, string address = "84.1.2.3", bool inView = true)
    {
        var tab = _presence.Join(Visitor(visitor), address);
        Assert.NotNull(tab);
        _presence.SetInView(tab, inView);
        return tab;
    }

    [Fact]
    public void CountsVisitorsWithATabInView_OncePerVisitor()
    {
        var first = Open(1);
        Open(1);
        Open(2, inView: false);
        Assert.Equal(1, _presence.InView);

        _presence.Leave(first);
        Assert.Equal(1, _presence.InView);
    }

    [Fact]
    public void AVisitorStopsCounting_WhenTheirLastTabLeavesOrIsHidden()
    {
        var tab = Open(1);
        var other = Open(2);

        _presence.SetInView(tab, false);
        _presence.Leave(other);

        Assert.Equal(0, _presence.InView);
    }

    [Fact]
    public void LeavingTwice_CountsOnce()
    {
        var tab = Open(1);
        Open(2);

        _presence.Leave(tab);
        _presence.Leave(tab);

        Assert.Equal(1, _presence.InView);
    }

    [Fact]
    public void AddsUpTheTimeInView_WithOverlappingTabsCountedOnce()
    {
        var first = Open(1);
        _clock.Now = Noon.AddSeconds(30);
        var second = Open(1);
        _clock.Now = Noon.AddSeconds(60);
        _presence.Leave(first);
        _clock.Now = Noon.AddSeconds(90);
        _presence.SetInView(second, false);
        _clock.Now = Noon.AddSeconds(200);
        _presence.SetInView(second, true);
        _clock.Now = Noon.AddSeconds(210);
        _presence.Leave(second);

        var time = Assert.Single(_presence.TakeTime());
        Assert.Equal(Today, time.Day);
        Assert.Equal(Visitor(1), time.Visitor);
        Assert.Equal(100_000, time.Ms);
        Assert.Empty(_presence.TakeTime());
    }

    [Fact]
    public void ATabLeftInView_CountsAtMostOneStretch()
    {
        var tab = Open(1);
        _clock.Now = Noon.AddHours(3);
        _presence.Leave(tab);

        Assert.Equal((long)LivePresence.MaxStretch.TotalMilliseconds, Assert.Single(_presence.TakeTime()).Ms);
    }

    [Fact]
    public void EndingStretchesForAShutdown_KeepsTheTimeSoFar_WithoutCountingItTwice()
    {
        var tab = Open(1);
        _clock.Now = Noon.AddSeconds(40);
        _presence.EndStretches();
        _presence.Leave(tab);

        Assert.Equal(40_000, Assert.Single(_presence.TakeTime()).Ms);
    }

    [Fact]
    public void AnIgnoredVisitor_StopsCountingAndKeepsNoTime()
    {
        var hidden = Open(1, inView: false);
        var shown = Open(1);
        Open(2);
        _clock.Now = Noon.AddSeconds(30);

        _presence.Ignore(Visitor(1));
        _presence.SetInView(hidden, true);
        _presence.Leave(shown);
        _clock.Now = Noon.AddSeconds(60);
        _presence.Leave(hidden);

        Assert.Equal(1, _presence.InView);
        Assert.Empty(_presence.TakeTime());
    }

    [Fact]
    public void AnIgnoredVisitor_StaysIgnored_InTabsOpenedAfterwards()
    {
        _presence.Ignore(Visitor(1));
        var tab = Open(1);
        _clock.Now = Noon.AddSeconds(30);
        _presence.Leave(tab);
        Open(1);

        Assert.Equal(0, _presence.InView);
        Assert.Empty(_presence.TakeTime());
    }

    [Fact]
    public void RefusesTabsPastTheLimitForOneAddress()
    {
        for (var i = 0; i < LivePresence.MaxTabsPerAddress; i++)
        {
            Assert.NotNull(_presence.Join(Visitor(i), "84.1.2.3"));
        }

        Assert.Null(_presence.Join(Visitor(99), "84.1.2.3"));
        Assert.NotNull(_presence.Join(Visitor(99), "84.1.2.4"));
    }
}
