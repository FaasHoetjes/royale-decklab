using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ClanSearchCacheTests
{
    private const string SearchJson = """
        {"items":[
          {"tag":"#AAA","name":"Dutch","type":"open","badgeId":16000074,"clanScore":100,"clanWarTrophies":2900,
           "location":{"id":57000166,"name":"Netherlands","isCountry":true,"countryCode":"NL"},"requiredTrophies":8000,"members":41},
          {"tag":"#BBB","name":"dutch","type":"inviteOnly","badgeId":16000038,"clanWarTrophies":3800,
           "location":{"id":57000166,"name":"Netherlands","isCountry":true,"countryCode":"NL"},"members":48},
          {"tag":"#CCC","name":"DUTCH","type":"closed","clanWarTrophies":2900,"members":50},
          {"name":"No tag","clanWarTrophies":9999,"members":50}],
         "paging":{"cursors":{}}}
        """;

    private sealed class StubApi : HttpMessageHandler
    {
        private int _calls;
        public int Calls => _calls;
        public string? LastQuery { get; private set; }
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref _calls);
            LastQuery = request.RequestUri?.Query;
            return Task.FromResult(new HttpResponseMessage(Status)
            {
                Content = new StringContent(SearchJson, Encoding.UTF8, "application/json"),
            });
        }
    }

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
            => new(handler, disposeHandler: false) { BaseAddress = new Uri("https://cr.test/v1/") };
    }

    private readonly StubApi _api = new();
    private readonly ClanSearchCache _cache;

    public ClanSearchCacheTests()
    {
        _cache = new ClanSearchCache(new StubFactory(_api), new MemoryCache(new MemoryCacheOptions()));
    }

    [Fact]
    public async Task ListsClansWithTags_StrongestWarClanFirst()
    {
        var clans = await _cache.SearchAsync("dutch");

        Assert.Equal(["#BBB", "#CCC", "#AAA"], clans.Select(c => c.Tag));
    }

    [Fact]
    public async Task ReadsWhatTellsClansApart()
    {
        var clans = await _cache.SearchAsync("dutch");

        var dutch = clans.Single(c => c.Tag == "#BBB");
        Assert.Equal(new ClanSummary("#BBB", "dutch", 16000038, 48, 3800, "Netherlands", ClanJoinType.InviteOnly), dutch);
        var closed = clans.Single(c => c.Tag == "#CCC");
        Assert.Null(closed.BadgeId);
        Assert.Null(closed.Location);
        Assert.Equal(ClanJoinType.Closed, closed.JoinType);
    }

    [Fact]
    public async Task SendsTheNameEscaped()
    {
        await _cache.SearchAsync("  royal kings ");

        Assert.Equal("?name=royal%20kings&limit=20", _api.LastQuery);
    }

    [Fact]
    public async Task AsksTheApiOnce_ForTheSameNameInAnyCase()
    {
        await _cache.SearchAsync("dutch");
        await _cache.SearchAsync("DUTCH ");

        Assert.Equal(1, _api.Calls);
    }

    [Fact]
    public async Task AsksAgain_AfterAFailedSearch()
    {
        _api.Status = HttpStatusCode.ServiceUnavailable;
        await Assert.ThrowsAsync<HttpRequestException>(() => _cache.SearchAsync("dutch"));

        _api.Status = HttpStatusCode.OK;
        var clans = await _cache.SearchAsync("dutch");

        Assert.Equal(3, clans.Count);
        Assert.Equal(2, _api.Calls);
    }
}
