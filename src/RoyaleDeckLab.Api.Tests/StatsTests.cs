using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Services;
using RoyaleDeckLab.Api.Services.Stats;

namespace RoyaleDeckLab.Api.Tests;

public sealed class StatsTests : IDisposable
{
    private const string Phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
    private const string Desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36";

    private static readonly DateTimeOffset Noon = new(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = DateOnly.FromDateTime(Noon.UtcDateTime);

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"stats-{Guid.NewGuid():N}.db");
    private readonly StatsStore _store;

    public StatsTests() => _store = new StatsStore(_path);

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var file in new[] { _path, _path + "-wal", _path + "-shm" })
        {
            File.Delete(file);
        }
    }

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static byte[] Id(int n) => [.. Enumerable.Repeat((byte)n, 16)];

    private static StatsEvent Event(string kind, int visitor, DateTimeOffset at, int tag = 0, string tool = "", string? country = null)
        => new(at.ToUnixTimeMilliseconds(), kind, Id(visitor), tag == 0 ? [] : Id(tag), tool, country, "phone", "direct");

    private long Metric(DateOnly from, DateOnly to, string metric, string dim = "")
        => _store.Compute(from, to).FirstOrDefault(t => t.Metric == metric && t.Dim == dim)?.Value ?? 0;

    [Fact]
    public void Add_CountsAVisitorsRepeatsOnceADay()
    {
        _store.Add([
            Event(StatsStore.Kinds.Lookup, 1, Noon, tag: 10),
            Event(StatsStore.Kinds.Lookup, 1, Noon.AddHours(1), tag: 10),
            Event(StatsStore.Kinds.Lookup, 1, Noon.AddHours(2), tag: 11),
            Event(StatsStore.Kinds.Lookup, 2, Noon, tag: 10),
            Event(StatsStore.Kinds.Lookup, 1, Noon.AddDays(-1), tag: 10),
        ]);

        Assert.Equal(2, Metric(Today, Today, "users"));
        Assert.Equal(3, Metric(Today, Today, "lookups"));
        Assert.Equal(2, Metric(Today, Today, "players"));
        Assert.Equal(1, Metric(Today.AddDays(-1), Today, "returning"));
        Assert.Equal(4, Metric(Today.AddDays(-1), Today, "lookups"));
        Assert.Equal(2, Metric(Today, Today, "daily_users", StatsStore.Day(Today)));
    }

    [Fact]
    public void Compute_CountsBreakdownsByUser()
    {
        _store.Add([
            Event(StatsStore.Kinds.Lookup, 1, Noon, tag: 10, country: "NL"),
            Event(StatsStore.Kinds.Lookup, 1, Noon, tag: 11, country: "NL"),
            Event(StatsStore.Kinds.Lookup, 2, Noon, tag: 12, country: "US"),
            Event(StatsStore.Kinds.Tool, 1, Noon, tool: "builder"),
            Event(StatsStore.Kinds.Tool, 2, Noon, tool: "builder"),
            Event(StatsStore.Kinds.Tool, 2, Noon.AddHours(1), tool: "builder"),
            Event(StatsStore.Kinds.ShareTap, 1, Noon),
            Event(StatsStore.Kinds.ShareTap, 1, Noon.AddHours(1)),
        ]);

        Assert.Equal(1, Metric(Today, Today, "country", "NL"));
        Assert.Equal(1, Metric(Today, Today, "country", "US"));
        Assert.Equal(2, Metric(Today, Today, "tool", "builder"));
        Assert.Equal(1, Metric(Today, Today, "share_taps"));
    }

    [Fact]
    public void Visitors_CountEveryoneWhoOpenedAPageButNotLinkPreviews()
    {
        _store.Add([
            Event(StatsStore.Kinds.Lookup, 1, Noon, tag: 10, country: "NL"),
            Event(StatsStore.Kinds.Tool, 1, Noon, tool: "generator", country: "NL"),
            Event(StatsStore.Kinds.Tool, 2, Noon, tool: "cards", country: "US"),
            Event(StatsStore.Kinds.Tool, 3, Noon, tool: "card", country: "US"),
            Event(StatsStore.Kinds.Preview, 4, Noon, tag: 11, country: "DE"),
        ]);

        Assert.Equal(1, Metric(Today, Today, "users"));
        Assert.Equal(3, Metric(Today, Today, "visitors"));
        Assert.Equal(1, Metric(Today, Today, "country", "NL"));
        Assert.Equal(2, Metric(Today, Today, "country", "US"));
        Assert.Equal(0, Metric(Today, Today, "country", "DE"));
        Assert.Equal(3, Metric(Today, Today, "source", "direct"));
        Assert.Equal(1, Metric(Today, Today, "device", "phone"));
    }

    [Fact]
    public void NewFromShare_IsAFriendWhoLooksUpAnotherPlayerWithinAWeek()
    {
        const int owner = 50;
        _store.Add([
            Event(StatsStore.Kinds.ShareOpen, 1, Noon, tag: owner),
            Event(StatsStore.Kinds.Lookup, 1, Noon.AddDays(3), tag: 60),
            Event(StatsStore.Kinds.ShareOpen, 2, Noon, tag: owner),
            Event(StatsStore.Kinds.Lookup, 2, Noon.AddHours(1), tag: owner),
            Event(StatsStore.Kinds.Lookup, 3, Noon.AddDays(-2), tag: 61),
            Event(StatsStore.Kinds.ShareOpen, 3, Noon, tag: owner),
            Event(StatsStore.Kinds.Lookup, 3, Noon.AddHours(1), tag: 61),
            Event(StatsStore.Kinds.ShareOpen, 4, Noon, tag: owner),
            Event(StatsStore.Kinds.Lookup, 4, Noon.AddDays(8), tag: 62),
        ]);

        Assert.Equal(1, Metric(Today, Today, "new_from_share"));
        Assert.Equal(4, Metric(Today, Today, "share_opens"));
    }

    [Fact]
    public void Maintain_SumsExpiredDaysAndTheirMonthBeforeDeletingThem()
    {
        var old = Noon.AddDays(-StatsStore.RetentionDays);
        var oldDay = DateOnly.FromDateTime(old.UtcDateTime);
        _store.Add([
            Event(StatsStore.Kinds.Lookup, 1, old, tag: 10),
            Event(StatsStore.Kinds.Lookup, 2, old, tag: 11),
            Event(StatsStore.Kinds.Lookup, 1, Noon, tag: 10),
        ]);

        _store.Maintain(Today);

        Assert.Equal(0, Metric(oldDay, oldDay, "users"));
        Assert.Equal(1, Metric(Today, Today, "users"));
        var day = _store.StoredTotals(periodLength: 10)[StatsStore.Day(oldDay)];
        Assert.Equal(2, day.Single(t => t.Metric == "users").Value);
        var month = _store.StoredTotals(periodLength: 7)[StatsStore.Month(oldDay)];
        Assert.Equal(2, month.Single(t => t.Metric == "players").Value);
    }

    [Fact]
    public void Maintain_ForgetsPastMonthsSecrets()
    {
        var october = _store.SecretFor("2026-10");
        _store.Maintain(Today);
        Assert.NotEqual(october, _store.SecretFor("2026-10"));
        Assert.Equal(_store.SecretFor("2026-11"), _store.SecretFor("2026-11"));
    }

    private static DefaultHttpContext Request(string ip, string userAgent, bool viaCloudflare = false)
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse(ip);
        context.Request.Headers.UserAgent = userAgent;
        context.Request.Headers["CF-IPCountry"] = "nl";
        if (viaCloudflare)
        {
            context.Items[StatsRecorder.ViaCloudflare] = true;
        }
        return context;
    }

    private List<StatsEvent> Drain(StatsRecorder recorder)
    {
        var events = new List<StatsEvent>();
        while (recorder.Queue.TryRead(out var e))
        {
            events.Add(e);
        }
        return events;
    }

    [Fact]
    public void Recorder_KeepsOnlyHashes()
    {
        var recorder = new StatsRecorder(_store, new Clock(Noon), NullLogger<StatsRecorder>.Instance);
        recorder.Record(Request("84.1.2.3", Phone, viaCloudflare: true), StatsStore.Kinds.Lookup, "#ABC", referrerHost: "www.reddit.com");
        recorder.Record(Request("84.1.2.3", Phone), StatsStore.Kinds.Lookup, "#ABC");
        recorder.Record(Request("84.1.2.4", Phone), StatsStore.Kinds.Lookup, "#ABC");
        recorder.Record(Request("84.1.2.3", Desktop), StatsStore.Kinds.Lookup, "#DEF");

        var events = Drain(recorder);
        Assert.Equal(4, events.Count);
        Assert.Equal(16, events[0].Visitor.Length);
        Assert.Equal(events[0].Visitor, events[1].Visitor);
        Assert.NotEqual(events[0].Visitor, events[2].Visitor);
        Assert.NotEqual(events[0].Visitor, events[3].Visitor);
        Assert.Equal(events[0].Tag, events[2].Tag);
        Assert.NotEqual(events[0].Tag, events[3].Tag);
        Assert.Equal(("NL", "phone", "reddit"), (events[0].Country, events[0].Device, events[0].Source));
        Assert.Null(events[1].Country);
        Assert.Equal("desktop", events[3].Device);
    }

    [Fact]
    public void Recorder_ChangesEveryonesCodeEachMonth()
    {
        var clock = new Clock(Noon);
        var recorder = new StatsRecorder(_store, clock, NullLogger<StatsRecorder>.Instance);
        recorder.Record(Request("84.1.2.3", Phone), StatsStore.Kinds.Lookup, "#ABC");
        clock.Now = Noon.AddMonths(1);
        recorder.Record(Request("84.1.2.3", Phone), StatsStore.Kinds.Lookup, "#ABC");

        var events = Drain(recorder);
        Assert.NotEqual(events[0].Visitor, events[1].Visitor);
        Assert.NotEqual(events[0].Tag, events[1].Tag);
    }

    [Fact]
    public void Recorder_LeavesOutBotsAndTheOwnersLookups()
    {
        var recorder = new StatsRecorder(_store, new Clock(Noon), NullLogger<StatsRecorder>.Instance);
        Assert.False(recorder.Record(Request("66.249.66.1", "Mozilla/5.0 (compatible; Googlebot/2.1)"), StatsStore.Kinds.Lookup, "#ABC"));
        Assert.False(recorder.Record(Request("84.1.2.3", ""), StatsStore.Kinds.Tool, tool: "faq"));
        Assert.False(recorder.Record(Request("84.1.2.3", Phone), StatsStore.Kinds.Lookup, StatsRecorder.OwnerTag));
        Assert.True(recorder.Record(Request("84.1.2.3", Phone), StatsStore.Kinds.ShareOpen, StatsRecorder.OwnerTag));
        Assert.True(recorder.Record(Request("1.2.3.4", "WhatsApp/2.23"), StatsStore.Kinds.Preview, "#ABC/000a0uc6cao9oaof"));
    }

    [Fact]
    public void Recorder_BelievesOnlyServedTags()
    {
        var recorder = new StatsRecorder(_store, new Clock(Noon), NullLogger<StatsRecorder>.Instance);
        recorder.NoteServed("2qgg92l8");
        Assert.True(recorder.WasServed("#2QGG92L8"));
        Assert.False(recorder.WasServed("#2QGG92L"));
    }

    [Theory]
    [InlineData(null, "direct")]
    [InlineData("", "direct")]
    [InlineData("royaledecklab.com", "direct")]
    [InlineData("www.reddit.com", "reddit")]
    [InlineData("old.reddit.com", "reddit")]
    [InlineData("www.google.nl", "google")]
    [InlineData("www.google.co.uk", "google")]
    [InlineData("gemini.google.com", "ai")]
    [InlineData("chatgpt.com", "ai")]
    [InlineData("t.co", "x")]
    [InlineData("m.youtube.com", "youtube")]
    [InlineData("notreddit.com", "other")]
    [InlineData("google.evil.example", "other")]
    public void Source_MapsTheReferrerToAFixedName(string? host, string expected)
        => Assert.Equal(expected, StatsClassify.Source(host));

    [Theory]
    [InlineData("NL", "NL")]
    [InlineData("t1", "T1")]
    [InlineData("<script>", null)]
    [InlineData("", null)]
    public void Country_KeepsOnlyTwoLetterCodes(string header, string? expected)
        => Assert.Equal(expected, StatsClassify.Country(header));

    [Fact]
    public void Report_FillsEveryDayAndFlagsRangesThatSpanMonths()
    {
        _store.Add([Event(StatsStore.Kinds.Lookup, 1, Noon, tag: 10)]);

        var report = StatsReport.Build(_store, Noon);

        var week = report.Ranges.Single(r => r.Key == "7d");
        Assert.Equal(7, week.Daily.Count);
        Assert.Equal(1, week.Daily[^1].Users);
        Assert.True(week.SpansMonths);
        Assert.False(report.Ranges.Single(r => r.Key == "today").SpansMonths);
        Assert.Equal(0, week.PreviousUsers);
        Assert.Equal((1L, 0L), (week.Visitors, week.PreviousVisitors));
        Assert.Null(report.Ranges.Single(r => r.Key == "today").PreviousUsers);
        var month = Assert.Single(report.Months);
        Assert.Equal(("2026-11", true, 1L, 1L), (month.Month, month.Partial, month.Users, month.Visitors));
    }

    [Fact]
    public void AdminStatsPage_IsServedButNeverIndexed()
    {
        var page = SpaPages.Resolve("/admin/stats", [], [], Noon);
        Assert.Equal(200, page.StatusCode);
        Assert.True(page.NoIndex);
        Assert.DoesNotContain("/admin", SpaPages.Sitemap([]));
    }
}
