using System.Net;
using System.Text;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ClanHistoryCacheTests
{
    private static ClanTag Tag(string value = "L9VRJ")
    {
        Assert.True(ClanTag.TryParse(value, out var tag));
        return tag;
    }

    private static Task<CrRiverRace?> Race(int period = 4) => Task.FromResult<CrRiverRace?>(new("warDay", period, null, []));

    [Fact]
    public async Task ReusesHistoryForFifteenMinutes_ThenFetchesAgain()
    {
        using var api = new StubApi();
        var clock = new ManualClock();
        var cache = new ClanHistoryCache(new StubFactory(api), clock);
        var first = await cache.GetAsync(Tag(), Race());
        clock.Advance(TimeSpan.FromMinutes(15) - TimeSpan.FromSeconds(1));
        Assert.Same(first, await cache.GetAsync(Tag(), Race()));
        Assert.Equal(1, api.Calls);
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.NotSame(first, await cache.GetAsync(Tag(), Race()));
        Assert.Equal(2, api.Calls);
    }

    [Theory]
    [InlineData(3, 4, 1)]
    [InlineData(6, 7, 2)]
    [InlineData(27, 0, 2)]
    public async Task RefreshesAtWeekOrSeasonRollover_ButNotEachDay(int before, int after, int calls)
    {
        using var api = new StubApi();
        var cache = new ClanHistoryCache(new StubFactory(api), TimeProvider.System);
        await cache.GetAsync(Tag(), Race(before));
        await cache.GetAsync(Tag(), Race(after));
        Assert.Equal(calls, api.Calls);
    }

    [Fact]
    public async Task EnteringARace_InvalidatesHistoryFromNotRacing()
    {
        using var api = new StubApi();
        var cache = new ClanHistoryCache(new StubFactory(api), TimeProvider.System);
        await cache.GetAsync(Tag(), Task.FromResult<CrRiverRace?>(null));
        await cache.GetAsync(Tag(), Race());
        Assert.Equal(2, api.Calls);
    }

    [Fact]
    public async Task AtCapacity_ReplacesTheOldestClan_AndKeepsOtherEntries()
    {
        using var api = new StubApi();
        var clock = new ManualClock();
        var cache = new ClanHistoryCache(new StubFactory(api), clock, capacity: 2);
        await cache.GetAsync(Tag(), Race());
        clock.Advance(TimeSpan.FromSeconds(1));
        await cache.GetAsync(Tag("9LRQC28V"), Race());
        clock.Advance(TimeSpan.FromSeconds(1));
        await cache.GetAsync(Tag("YPP2RJ92C"), Race());
        await cache.GetAsync(Tag("9LRQC28V"), Race());
        Assert.Equal(3, api.Calls);
        await cache.GetAsync(Tag(), Race());
        Assert.Equal(4, api.Calls);
    }

    [Fact]
    public async Task ExpiredEntriesAreRemoved_BeforeEvictingAnUnexpiredClan()
    {
        using var api = new StubApi();
        var clock = new ManualClock();
        var cache = new ClanHistoryCache(new StubFactory(api), clock, capacity: 2);
        await cache.GetAsync(Tag(), Race());
        clock.Advance(TimeSpan.FromMinutes(10));
        await cache.GetAsync(Tag("9LRQC28V"), Race());
        clock.Advance(TimeSpan.FromMinutes(5));
        await cache.GetAsync(Tag("YPP2RJ92C"), Race());
        await cache.GetAsync(Tag("9LRQC28V"), Race());
        Assert.Equal(3, api.Calls);
    }

    [Fact]
    public async Task ColdHistoryStartsBeforeTheCurrentRaceCompletes_AndSharesConcurrentRequests()
    {
        using var api = new StubApi { HoldResponses = true };
        var cache = new ClanHistoryCache(new StubFactory(api), TimeProvider.System);
        var race = new TaskCompletionSource<CrRiverRace?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var requests = Enumerable.Range(0, 10).Select(_ => cache.GetAsync(Tag(), race.Task)).ToArray();
        await api.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(1, api.Calls);
        Assert.All(requests, request => Assert.False(request.IsCompleted));
        race.SetResult(await Race());
        api.Release.SetResult();
        var logs = await Task.WhenAll(requests).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.All(logs, log => Assert.Same(logs[0], log));
        Assert.Equal(1, api.Calls);
    }

    [Fact]
    public async Task CancellingOneWaiter_DoesNotEvictOrCancelTheSharedFetch()
    {
        using var api = new StubApi { HoldResponses = true };
        var cache = new ClanHistoryCache(new StubFactory(api), TimeProvider.System);
        using var cancelled = new CancellationTokenSource();
        var first = cache.GetAsync(Tag(), Race(), cancelled.Token);
        var second = cache.GetAsync(Tag(), Race());
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        api.Release.SetResult();
        await second.WaitAsync(TimeSpan.FromSeconds(5));
        await cache.GetAsync(Tag(), Race());
        Assert.Equal(1, api.Calls);
    }

    [Fact]
    public async Task FailedFetchesAreRetried()
    {
        using var api = new StubApi { Status = HttpStatusCode.ServiceUnavailable };
        var cache = new ClanHistoryCache(new StubFactory(api), TimeProvider.System);
        await Assert.ThrowsAsync<HttpRequestException>(() => cache.GetAsync(Tag(), Race()));
        api.Status = HttpStatusCode.OK;
        await cache.GetAsync(Tag(), Race());
        Assert.Equal(2, api.Calls);
    }

    [Fact]
    public async Task KeepsOnlyThisClansStandings()
    {
        using var api = new StubApi();
        var cache = new ClanHistoryCache(new StubFactory(api), TimeProvider.System);
        var log = await cache.GetAsync(Tag(), Race());
        var week = Assert.Single(log.Items!);
        var standing = Assert.Single(week.Standings!);
        Assert.Equal("#L9VRJ", standing.Clan!.Tag);
        Assert.Equal(16, Assert.Single(standing.Clan.Participants!).DecksUsed);
        Assert.Equal("?limit=4", api.LastQuery);
    }

    private sealed class ManualClock : TimeProvider
    {
        private long _ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => _ticks;
        public void Advance(TimeSpan by) => _ticks += by.Ticks;
    }

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false) { BaseAddress = new Uri("https://cr.test/v1/") };
    }

    private sealed class StubApi : HttpMessageHandler
    {
        public int Calls;
        public string? LastQuery;
        public bool HoldResponses;
        public HttpStatusCode Status = HttpStatusCode.OK;
        public readonly TaskCompletionSource Started = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly TaskCompletionSource Release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls);
            LastQuery = request.RequestUri!.Query;
            Started.TrySetResult();
            if (HoldResponses) await Release.Task.WaitAsync(ct);
            var tag = Uri.UnescapeDataString(request.RequestUri.AbsolutePath).Split('/')[3];
            var body = """{"items":[{"seasonId":137,"sectionIndex":3,"createdDate":"20261102T093905.000Z","standings":[{"rank":2,"clan":{"tag":"#TAG","participants":[{"tag":"#AAA","fame":3000,"decksUsed":16}]}},{"rank":1,"clan":{"tag":"#OTHER","participants":[{"tag":"#BBB","fame":9999,"decksUsed":16}]}}]}]}""".Replace("#TAG", tag, StringComparison.Ordinal);
            return new HttpResponseMessage(Status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }
}
