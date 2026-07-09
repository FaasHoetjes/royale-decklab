using System.Net;
using System.Text;
using RoyaleDeckLab.Api.Clients;

namespace RoyaleDeckLab.Api.Tests;

public sealed class PlayerProfileCacheTests
{
    private sealed class StubHandler : HttpMessageHandler
    {
        private int _calls;
        public int Calls => _calls;
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref _calls);
            return Task.FromResult(new HttpResponseMessage(Status)
            {
                Content = new StringContent("""{"tag":"#2QGG92L9","name":"Player"}""", Encoding.UTF8, "application/json"),
            });
        }
    }

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
            => new(handler, disposeHandler: false) { BaseAddress = new Uri("https://cr.test/v1/") };
    }

    private sealed class ManualClock : TimeProvider
    {
        private long _ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => _ticks;
        public void Advance(TimeSpan by) => _ticks += by.Ticks;
    }

    private static (PlayerProfileCache cache, StubHandler upstream, ManualClock clock) Setup()
    {
        var upstream = new StubHandler();
        var clock = new ManualClock();
        return (new PlayerProfileCache(new StubFactory(upstream), clock), upstream, clock);
    }

    [Fact]
    public async Task CoalescesConcurrentRequests_IntoOneUpstreamCall()
    {
        var (cache, upstream, _) = Setup();

        var results = await Task.WhenAll(
            cache.GetPlayerDataAsync("#2QGG92L9"),
            cache.GetPlayerDataAsync("#2QGG92L9"),
            cache.GetPlayerDataAsync("#2QGG92L9"));

        Assert.Equal(1, upstream.Calls);
        Assert.All(results, p => Assert.Equal("Player", p.Name));
    }

    [Fact]
    public async Task ServesFromCache_WithinTtl_AndRefetchesAfterIt()
    {
        var (cache, upstream, clock) = Setup();

        await cache.GetPlayerDataAsync("#2QGG92L9");
        clock.Advance(TimeSpan.FromSeconds(30));
        await cache.GetPlayerDataAsync("#2QGG92L9");
        Assert.Equal(1, upstream.Calls);

        clock.Advance(TimeSpan.FromSeconds(31)); // now past the 60s TTL
        await cache.GetPlayerDataAsync("#2QGG92L9");
        Assert.Equal(2, upstream.Calls);
    }

    [Fact]
    public async Task TagSpellings_ShareOneCacheEntry()
    {
        var (cache, upstream, _) = Setup();

        await cache.GetPlayerDataAsync("#2QGG92L9");
        await cache.GetPlayerDataAsync("2qgg92l9");

        Assert.Equal(1, upstream.Calls);
    }

    [Fact]
    public async Task AFailedFetch_IsNotCached()
    {
        var (cache, upstream, _) = Setup();
        upstream.Status = HttpStatusCode.InternalServerError;

        await Assert.ThrowsAsync<HttpRequestException>(() => cache.GetPlayerDataAsync("#2QGG92L9"));

        upstream.Status = HttpStatusCode.OK;
        var player = await cache.GetPlayerDataAsync("#2QGG92L9");

        Assert.Equal("Player", player.Name);
        Assert.Equal(2, upstream.Calls);
    }
}
