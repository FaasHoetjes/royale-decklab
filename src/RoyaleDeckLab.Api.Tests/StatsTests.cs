using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Services;
using RoyaleDeckLab.Api.Services.Stats;
using RoyaleDeckLab.Api.Controllers;

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

    private static StatsEvent Event(
        string kind, int visitor, DateTimeOffset at, int tag = 0, string tool = "", string? country = null,
        string source = "direct", string? campaign = null, string device = "phone")
        => new(at.ToUnixTimeMilliseconds(), kind, Id(visitor), tag == 0 ? [] : Id(tag), tool, country, device, source, campaign);

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
    public void Exports_CountEveryActionAndDistinctPeopleAcrossToolsAndDays()
    {
        var copy = Event(StatsStore.Kinds.DeckCopy, 1, Noon, tool: "generator", country: "NL", source: "reddit");
        _store.Add([
            copy, copy, copy with { AtMs = Noon.AddHours(1).ToUnixTimeMilliseconds() },
            Event(StatsStore.Kinds.DeckOpen, 1, Noon, tool: "generator", country: "NL", source: "reddit"),
            Event(StatsStore.Kinds.DeckCopy, 1, Noon, tool: "builder", country: "NL", source: "reddit"),
            Event(StatsStore.Kinds.DeckOpen, 2, Noon, tool: "best-decks", country: "US", source: "google"),
            Event(StatsStore.Kinds.DeckOpen, 1, Noon.AddDays(-1), tool: "generator", country: "NL", source: "reddit"),
        ]);

        var report = StatsReport.Build(_store, Noon);
        var today = report.Ranges.Single(r => r.Key == "today").DeckExports;
        Assert.Equal((4L, 2L, 2L), (today.Copies, today.Opens, today.Visitors));
        var week = report.Ranges.Single(r => r.Key == "7d").DeckExports;
        Assert.Equal((4L, 3L, 2L), (week.Copies, week.Opens, week.Visitors));
        Assert.Equal(new StatsReport.ExportTool("generator", 3, 2, 1), week.Tools[0]);
        Assert.Contains(new StatsReport.ExportTool("builder", 1, 0, 1), week.Tools);
        Assert.Contains(new StatsReport.ExportTool("best-decks", 0, 1, 1), week.Tools);
        var month = Assert.Single(report.Months);
        Assert.Equal((4L, 3L, 2L), (month.DeckCopies, month.DeckOpens, month.DeckExporters));

        var filtered = StatsReport.Build(_store, Noon, new StatsFilter(Source: "reddit", Country: "NL", Device: "phone"))
            .Ranges.Single(r => r.Key == "7d").DeckExports;
        Assert.Equal((4L, 2L, 1L), (filtered.Copies, filtered.Opens, filtered.Visitors));
        Assert.DoesNotContain(filtered.Tools, t => t.Key == "best-decks");
    }

    [Fact]
    public void Exports_KeepDailyAndMonthlyTotalsAfterEventsExpire()
    {
        var old = Noon.AddDays(-StatsStore.RetentionDays);
        var oldDay = DateOnly.FromDateTime(old.UtcDateTime);
        var copy = Event(StatsStore.Kinds.DeckCopy, 1, old, tool: "upgrades");
        _store.Add([copy, copy, Event(StatsStore.Kinds.DeckOpen, 1, old, tool: "generator")]);
        _store.Maintain(Today);

        Assert.Equal(0, Metric(oldDay, oldDay, "deck_copies"));
        var day = _store.StoredTotals(periodLength: 10)[StatsStore.Day(oldDay)];
        Assert.Equal(2, day.Single(t => t.Metric == "deck_copies").Value);
        Assert.Equal(1, day.Single(t => t.Metric == "deck_opens").Value);
        Assert.Equal(1, day.Single(t => t.Metric == "deck_exporters").Value);
        var month = Assert.Single(StatsReport.Build(_store, Noon).Months);
        Assert.Equal((2L, 1L, 1L), (month.DeckCopies, month.DeckOpens, month.DeckExporters));
    }

    [Theory]
    [InlineData("deck_copy", "generator", true)]
    [InlineData("deck_copy", "builder", true)]
    [InlineData("deck_open", "upgrades", true)]
    [InlineData("deck_open", "best-decks", true)]
    [InlineData("deck_copy", null, false)]
    [InlineData("deck_open", "home", false)]
    [InlineData("deck_open", "clan", false)]
    [InlineData("deck_copy", "untrusted", false)]
    [InlineData("unknown", "builder", false)]
    public void Controller_AcceptsOnlyKnownExportKindsAndTools(string kind, string? tool, bool accepted)
    {
        var clock = new Clock(Noon);
        var recorder = new StatsRecorder(_store, clock, NullLogger<StatsRecorder>.Instance);
        var controller = new StatsController(recorder, new LivePresence(clock), _store, clock)
        {
            ControllerContext = new ControllerContext { HttpContext = Request("84.1.2.3", Phone) },
        };
        Assert.IsType<NoContentResult>(controller.Event(new StatsController.EventBody(kind, "#YPP2RJ92C", tool, null, null, null)));
        var events = Drain(recorder);
        if (accepted)
        {
            var recorded = Assert.Single(events);
            Assert.Equal((kind, tool), (recorded.Kind, recorded.Tool));
            Assert.Empty(recorded.Tag);
        }
        else
        {
            Assert.Empty(events);
        }
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

    [Fact]
    public void Maintain_LeavesNoDeletedMonthKeyInTheDatabaseFiles()
    {
        var october = _store.SecretFor("2026-10");
        Assert.True(FilesContain(october));

        _store.Maintain(Today);

        Assert.False(FilesContain(october));
    }

    private bool FilesContain(byte[] needle)
        => new[] { _path, _path + "-wal" }.Any(path => File.Exists(path) && Bytes(path).AsSpan().IndexOf(needle) >= 0);

    private static byte[] Bytes(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        return memory.ToArray();
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
        recorder.Record(Request("84.1.2.3", Phone, viaCloudflare: true), StatsStore.Kinds.Lookup, "#ABC", origin: new VisitOrigin("www.reddit.com"));
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
    public void Recorder_StopsAtTheDailyCapCountsPreviewsToo_AndResetsTheNextDay()
    {
        var clock = new Clock(Noon);
        var logger = new WarningCounter();
        var recorder = new StatsRecorder(_store, clock, logger) { DailyCap = 3 };
        var context = Request("84.1.2.3", Phone);

        Assert.True(recorder.Record(context, StatsStore.Kinds.Lookup, "#ABC"));
        Assert.True(recorder.Record(context, StatsStore.Kinds.Preview, "#ABC/share"));
        Assert.True(recorder.Record(context, StatsStore.Kinds.Lookup, "#DEF"));
        Assert.False(recorder.Record(context, StatsStore.Kinds.Lookup, "#GHI"));
        Assert.False(recorder.Record(context, StatsStore.Kinds.Preview, "#ABC/other"));
        Assert.Equal(3, Drain(recorder).Count);
        Assert.Equal(1, logger.Warnings);

        clock.Now = Noon.AddDays(1);
        Assert.True(recorder.Record(context, StatsStore.Kinds.Lookup, "#GHI"));
        Assert.Single(Drain(recorder));
        Assert.Equal(1, logger.Warnings);
    }

    private sealed class WarningCounter : ILogger<StatsRecorder>
    {
        public int Warnings { get; private set; }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (logLevel == LogLevel.Warning)
            {
                Warnings++;
            }
        }
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
    public void Report_FillsEveryDayAndComparesWithThePeriodBefore()
    {
        _store.Add([Event(StatsStore.Kinds.Lookup, 1, Noon, tag: 10)]);

        var report = StatsReport.Build(_store, Noon);

        var week = report.Ranges.Single(r => r.Key == "7d");
        Assert.Equal(7, week.Daily.Count);
        Assert.Equal(1, week.Daily[^1].Users);
        Assert.Equal(0, week.PreviousUsers);
        Assert.Equal((1L, 0L), (week.Visitors, week.PreviousVisitors));
        Assert.Null(report.Ranges.Single(r => r.Key == "today").PreviousUsers);
        var month = Assert.Single(report.Months);
        Assert.Equal(("2026-11", true, 1L, 1L), (month.Month, month.Partial, month.Users, month.Visitors));
    }

    [Fact]
    public void Report_ShowsVisitorsPerDayThePeriodBeforeAndTodayByHour()
    {
        _store.Add([
            Event(StatsStore.Kinds.Tool, 1, Noon.AddHours(-3), tool: "home"),
            Event(StatsStore.Kinds.Lookup, 1, Noon, tag: 10),
            Event(StatsStore.Kinds.Tool, 2, Noon, tool: "faq"),
            Event(StatsStore.Kinds.Preview, 3, Noon, tag: 10),
            Event(StatsStore.Kinds.Tool, 4, Noon.AddDays(-7), tool: "faq"),
        ]);

        var report = StatsReport.Build(_store, Noon);

        var week = report.Ranges.Single(r => r.Key == "7d");
        Assert.Equal(new StatsReport.Point(StatsStore.Day(Today), 1, 2), week.Daily[^1]);
        Assert.NotNull(week.PreviousDaily);
        Assert.Equal(7, week.PreviousDaily.Count);
        Assert.Equal(new StatsReport.Point(StatsStore.Day(Today.AddDays(-7)), 0, 1), week.PreviousDaily[^1]);
        var today = report.Ranges.Single(r => r.Key == "today");
        Assert.Null(today.PreviousDaily);
        Assert.NotNull(today.Hourly);
        Assert.Equal(13, today.Hourly.Count);
        Assert.Equal(new StatsReport.Point("09", 1, 1), today.Hourly[9]);
        Assert.Equal(new StatsReport.Point("12", 0, 1), today.Hourly[12]);
        Assert.Equal(2, today.Hourly.Sum(h => h.Visitors));
        Assert.Null(week.Hourly);
    }

    [Fact]
    public void Filter_KeepsOnlyTheVisitorsWhoCameThatWay()
    {
        _store.Add([
            Event(StatsStore.Kinds.Tool, 1, Noon, tool: "home", source: "reddit", country: "NL"),
            Event(StatsStore.Kinds.Lookup, 1, Noon.AddMinutes(5), tag: 10, country: "NL"),
            Event(StatsStore.Kinds.Tool, 2, Noon, tool: "home", source: "google", country: "US", device: "desktop"),
            Event(StatsStore.Kinds.Lookup, 3, Noon, tag: 11, source: "google", country: "US"),
        ]);

        var reddit = new StatsFilter(Source: "reddit");
        Assert.Equal(1, _store.Compute(Today, Today, reddit).Single(t => t.Metric == "visitors").Value);
        Assert.Equal(1, _store.Compute(Today, Today, reddit).Single(t => t.Metric == "users").Value);
        Assert.Equal(2, _store.Compute(Today, Today, new StatsFilter(Country: "US")).Single(t => t.Metric == "visitors").Value);
        Assert.Equal(0, _store.Compute(Today, Today, new StatsFilter(Source: "google", Device: "desktop")).Single(t => t.Metric == "users").Value);
        Assert.Equal(0, _store.Compute(Today, Today, new StatsFilter(Source: "bing")).Single(t => t.Metric == "visitors").Value);
        Assert.Equal(3, Metric(Today, Today, "visitors"));

        var report = StatsReport.Build(_store, Noon, reddit);
        var today = report.Ranges.Single(r => r.Key == "today");
        Assert.Equal((1L, 1L), (today.Visitors, today.Users));
        Assert.Equal(reddit, report.Filters);
        Assert.Equal(3, report.Months.Single().Visitors);
    }

    [Fact]
    public void Compute_CountsWhoLookedUpAPlayerPerSourceAndCountry()
    {
        _store.Add([
            Event(StatsStore.Kinds.Tool, 1, Noon, tool: "home", source: "reddit", country: "NL"),
            Event(StatsStore.Kinds.Lookup, 1, Noon.AddMinutes(5), tag: 10, country: "NL"),
            Event(StatsStore.Kinds.Tool, 2, Noon, tool: "home", source: "reddit", country: "NL"),
            Event(StatsStore.Kinds.Tool, 3, Noon, tool: "home", source: "google"),
        ]);

        Assert.Equal(2, Metric(Today, Today, "source", "reddit"));
        Assert.Equal(1, Metric(Today, Today, "source_users", "reddit"));
        Assert.Equal(1, Metric(Today, Today, "source_users", "direct"));
        Assert.Equal(0, Metric(Today, Today, "source_users", "google"));
        Assert.Equal(1, Metric(Today, Today, "country_users", "NL"));
    }

    [Fact]
    public void Compute_CountsCampaignLinks()
    {
        _store.Add([
            Event(StatsStore.Kinds.Tool, 1, Noon, tool: "home", source: "reddit", campaign: "update-post"),
            Event(StatsStore.Kinds.Lookup, 1, Noon, tag: 10, source: "reddit", campaign: "update-post"),
            Event(StatsStore.Kinds.Tool, 2, Noon, tool: "home"),
        ]);

        Assert.Equal(1, Metric(Today, Today, "campaign", "update-post"));
        Assert.DoesNotContain(_store.Compute(Today, Today), t => t.Metric == "campaign" && t.Dim == "");
    }

    [Fact]
    public void Store_MigratesOldEventsForCampaignsAndExportCounts()
    {
        var path = Path.Combine(Path.GetTempPath(), $"stats-{Guid.NewGuid():N}.db");
        try
        {
            using (var connection = new SqliteConnection($"Data Source={path}"))
            {
                connection.Open();
                using var create = connection.CreateCommand();
                create.CommandText =
                    """
                    CREATE TABLE events (
                        day TEXT NOT NULL, kind TEXT NOT NULL, visitor BLOB NOT NULL, tag BLOB NOT NULL, tool TEXT NOT NULL,
                        at_ms INTEGER NOT NULL, country TEXT, device TEXT, source TEXT,
                        PRIMARY KEY (day, kind, visitor, tag, tool)
                    ) WITHOUT ROWID;
                    INSERT INTO events (day, kind, visitor, tag, tool, at_ms)
                    VALUES ('2026-11-05', 'lookup', X'01', X'02', '', 1793880000000);
                    """;
                create.ExecuteNonQuery();
            }

            var store = new StatsStore(path);
            store.Add([Event(StatsStore.Kinds.Tool, 1, Noon, tool: "home", campaign: "launch")]);
            Assert.Equal(1, store.Compute(Today, Today).Single(t => t.Metric == "campaign").Value);
            var copy = Event(StatsStore.Kinds.DeckCopy, 1, Noon, tool: "builder");
            store.Add([copy, copy]);
            var reopened = new StatsStore(path);
            var totals = reopened.Compute(Today, Today);
            Assert.Equal(1, totals.Single(t => t.Metric == "lookups").Value);
            Assert.Equal(2, totals.Single(t => t.Metric == "deck_copies").Value);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            foreach (var file in new[] { path, path + "-wal", path + "-shm" })
            {
                File.Delete(file);
            }
        }
    }

    [Fact]
    public void Recorder_LetsCampaignLinksWinOverTheReferrer()
    {
        var recorder = new StatsRecorder(_store, new Clock(Noon), NullLogger<StatsRecorder>.Instance);
        recorder.Record(Request("84.1.2.3", Phone), StatsStore.Kinds.Tool, tool: "home", origin: new VisitOrigin(null, "reddit", "Update-Post"));
        recorder.Record(Request("84.1.2.3", Phone), StatsStore.Kinds.Tool, tool: "faq", origin: new VisitOrigin("www.google.com", "chatgpt.com"));
        recorder.Record(Request("84.1.2.3", Phone), StatsStore.Kinds.Tool, tool: "cards", origin: new VisitOrigin("www.google.com", null, "<b>hi</b>"));

        var events = Drain(recorder);
        Assert.Equal(("reddit", "update-post"), (events[0].Source, events[0].Campaign));
        Assert.Equal(("ai", null), (events[1].Source, events[1].Campaign));
        Assert.Equal(("google", null), (events[2].Source, events[2].Campaign));
    }

    [Fact]
    public void Recorder_GivesAVisitorTheCodeTheirEventsCarry()
    {
        var recorder = new StatsRecorder(_store, new Clock(Noon), NullLogger<StatsRecorder>.Instance);
        recorder.Record(Request("84.1.2.3", Phone), StatsStore.Kinds.Tool, tool: "home");

        Assert.Equal(Drain(recorder)[0].Visitor, recorder.VisitorOf(Request("84.1.2.3", Phone)));
        Assert.NotEqual(recorder.VisitorOf(Request("84.1.2.3", Phone)), recorder.VisitorOf(Request("84.1.2.3", Desktop)));
        Assert.Null(recorder.VisitorOf(Request("84.1.2.3", "Googlebot/2.1")));
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("reddit", "reddit")]
    [InlineData("Reddit", "reddit")]
    [InlineData("twitter", "x")]
    [InlineData("chatgpt.com", "ai")]
    [InlineData("www.reddit.com", "reddit")]
    [InlineData("direct", "other")]
    [InlineData("newsletter", "other")]
    public void UtmSource_MapsToAFixedName(string? value, string? expected)
        => Assert.Equal(expected, StatsClassify.UtmSource(value));

    [Theory]
    [InlineData("update-post", "update-post")]
    [InlineData(" Update_Post.2 ", "update_post.2")]
    [InlineData("-leading", null)]
    [InlineData("has space", null)]
    [InlineData("a-very-long-campaign-name-past-32-chars", null)]
    [InlineData(null, null)]
    public void Campaign_KeepsOnlyShortPlainNames(string? value, string? expected)
        => Assert.Equal(expected, StatsClassify.Campaign(value));

    [Fact]
    public void AdminStatsPage_IsServedButNeverIndexed()
    {
        var page = SpaPages.Resolve("/admin/stats", [], [], Noon);
        Assert.Equal(200, page.StatusCode);
        Assert.True(page.NoIndex);
        Assert.DoesNotContain("/admin", SpaPages.Sitemap([]));
    }
}
