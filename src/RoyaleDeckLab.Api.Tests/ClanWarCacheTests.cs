using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ClanWarCacheTests
{
    private const string ClanJson = """
        {"tag":"#L9VRJ","name":"Example","badgeId":16000067,"members":2,"memberList":[
          {"tag":"#AAA","name":"Anna","role":"leader","lastSeen":"20261106T154147.000Z","trophies":14000},
          {"tag":"#BBB","name":"Bob","role":"member","lastSeen":"20261105T230420.000Z","trophies":13000}]}
        """;

    private const string RaceJson = """
        {"state":"full","clan":{"tag":"#L9VRJ","name":"Example","fame":3435,"participants":[
          {"tag":"#AAA","name":"Anna","fame":900,"repairPoints":0,"boatAttacks":0,"decksUsed":8,"decksUsedToday":4},
          {"tag":"#GONE","name":"Gone","fame":200,"repairPoints":0,"boatAttacks":0,"decksUsed":2,"decksUsedToday":0}]},
         "clans":[{"tag":"#L9VRJ","name":"Example","fame":3435,"periodPoints":9950},{"tag":"#OTHER","name":"Other","fame":835,"periodPoints":14450}],
         "sectionIndex":0,"periodIndex":4,"periodType":"warDay"}
        """;

    private const string LogJson = """
        {"items":[{"seasonId":137,"sectionIndex":3,"createdDate":"20261102T093905.000Z","standings":[
          {"rank":2,"trophyChange":20,"clan":{"tag":"#L9VRJ","fame":30000,"participants":[
            {"tag":"#AAA","fame":3000,"decksUsed":16,"decksUsedToday":0},
            {"tag":"#BBB","fame":900,"decksUsed":6,"decksUsedToday":0}]}}]}]}
        """;

    private sealed class StubApi : HttpMessageHandler
    {
        private int _calls;
        public int Calls => _calls;
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
        public HttpStatusCode RaceStatus { get; set; } = HttpStatusCode.OK;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref _calls);
            var path = request.RequestUri?.AbsolutePath ?? "";
            var body = path switch
            {
                _ when path.EndsWith("/currentriverrace", StringComparison.Ordinal) => RaceJson,
                _ when path.EndsWith("/riverracelog", StringComparison.Ordinal) => LogJson,
                _ => ClanJson,
            };
            var status = path.EndsWith("/currentriverrace", StringComparison.Ordinal) && Status == HttpStatusCode.OK ? RaceStatus : Status;
            return Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            });
        }
    }

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
            => new(handler, disposeHandler: false) { BaseAddress = new Uri("https://cr.test/v1/") };
    }

    private readonly StubApi _api = new();
    private readonly ClanWarCache _cache;
    private readonly ClanTag _tag;

    public ClanWarCacheTests()
    {
        _cache = new ClanWarCache(new StubFactory(_api), new MemoryCache(new MemoryCacheOptions()), TimeProvider.System);
        Assert.True(ClanTag.TryParse("l9vrj", out var tag));
        _tag = tag;
    }

    [Fact]
    public async Task ReadsTheClanRaceAndLog_FromTheApiShapes()
    {
        var war = await _cache.GetAsync(_tag);

        Assert.Equal("Example", war.Name);
        Assert.Equal(16000067, war.BadgeId);
        Assert.Equal(WarPeriod.WarDay, war.Period);
        Assert.Equal(2, war.Day);
        Assert.Equal(["#BBB", "#AAA"], war.Members.Select(m => m.Tag));
        Assert.Equal(ClanRole.Leader, war.Members[1].Role);
        Assert.Equal(8, war.Members[1].DecksUsedThisWeek);
        Assert.Equal(900, war.Members[1].Fame);
        Assert.Equal([6], war.Members[0].DecksUsedPastWeeks);
        Assert.Equal(1, war.LeaversWithDecks);
        Assert.Equal(2, Assert.Single(war.PastWeeks).Rank);
        Assert.Equal([900], war.Members[0].FamePastWeeks);
        Assert.Equal(new RaceClan("#OTHER", "Other", 835, 14_450), war.Race[1]);
    }

    [Fact]
    public async Task AClanNotInARiverRace_IsNotRacing_InsteadOfMissing()
    {
        _api.RaceStatus = HttpStatusCode.NotFound;

        var war = await _cache.GetAsync(_tag);

        Assert.Equal(WarPeriod.NotRacing, war.Period);
        Assert.Equal(2, war.Members.Count);
    }

    [Fact]
    public async Task ConcurrentRequestsForOneClan_ShareOneFetch()
    {
        await Task.WhenAll(_cache.GetAsync(_tag), _cache.GetAsync(_tag), _cache.GetAsync(_tag));
        await _cache.GetAsync(_tag);

        Assert.Equal(3, _api.Calls);
    }

    [Fact]
    public async Task AFailedFetch_IsNotCached()
    {
        _api.Status = HttpStatusCode.NotFound;
        var failure = await Assert.ThrowsAsync<HttpRequestException>(() => _cache.GetAsync(_tag));
        Assert.Equal(HttpStatusCode.NotFound, failure.StatusCode);

        _api.Status = HttpStatusCode.OK;
        var war = await _cache.GetAsync(_tag);

        Assert.Equal("Example", war.Name);
    }
}
