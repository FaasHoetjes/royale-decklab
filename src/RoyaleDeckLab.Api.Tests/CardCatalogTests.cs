using System.Net;
using System.Text;
using Microsoft.Extensions.DependencyInjection;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CardCatalogTests
{
    [Fact]
    public async Task ColdCallersShareRefresh_AndOneCancellationDoesNotCancelIt()
    {
        using var fixture = new Fixture();
        var release = new TaskCompletionSource<HttpResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.Api.Respond = _ => release.Task;
        using var cancelled = new CancellationTokenSource();
        var first = fixture.Catalog.GetAsync(cancelled.Token);
        var second = fixture.Catalog.GetAsync();
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        Assert.Equal(1, fixture.Api.Calls);
        release.SetResult(Cards("Original"));
        Assert.Equal("Original", Assert.Single(await second.WaitAsync(TimeSpan.FromSeconds(5))).Name);
        Assert.Equal(1, fixture.Api.Calls);
    }

    [Fact]
    public async Task ExpiredCatalogIsReturnedImmediately_WhileOneRefreshRuns()
    {
        using var fixture = new Fixture();
        var original = await fixture.Catalog.GetAsync();
        fixture.Clock.Now += TimeSpan.FromHours(6);
        var release = new TaskCompletionSource<HttpResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.Api.Respond = _ => release.Task;
        try
        {
            for (var i = 0; i < 20; i++)
            {
                Assert.Same(original, await fixture.Catalog.GetAsync().WaitAsync(TimeSpan.FromSeconds(5)));
            }
            Assert.Equal(2, fixture.Api.Calls);
        }
        finally
        {
            release.TrySetResult(Cards("Updated"));
        }
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while ((await fixture.Catalog.GetAsync(deadline.Token))[0].Name != "Updated")
        {
            await Task.Delay(10, deadline.Token);
        }
        Assert.Equal(2, fixture.Api.Calls);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FailedOrEmptyRefreshServesStale_AndBacksOffBeforeRetry(bool empty)
    {
        using var fixture = new Fixture();
        var original = await fixture.Catalog.GetAsync();
        fixture.Clock.Now += TimeSpan.FromHours(6);
        fixture.Api.Respond = _ => Task.FromResult(empty
            ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"items\":[]}", Encoding.UTF8, "application/json") }
            : new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        for (var i = 0; i < 20; i++)
        {
            Assert.Same(original, await fixture.Catalog.GetAsync());
        }
        Assert.Equal(2, fixture.Api.Calls);
        fixture.Clock.Now += TimeSpan.FromSeconds(29);
        Assert.Same(original, await fixture.Catalog.GetAsync());
        Assert.Equal(2, fixture.Api.Calls);

        fixture.Api.Respond = _ => Task.FromResult(Cards("Recovered"));
        fixture.Clock.Now += TimeSpan.FromSeconds(1);
        await fixture.Catalog.GetAsync();
        Assert.Equal("Recovered", Assert.Single(await fixture.Catalog.GetAsync()).Name);
        Assert.Equal(3, fixture.Api.Calls);
    }

    [Fact]
    public async Task ColdFailureAlsoBacksOff_AndRecoversAfterDelay()
    {
        using var fixture = new Fixture();
        fixture.Api.Respond = _ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        for (var i = 0; i < 3; i++)
        {
            await Assert.ThrowsAsync<HttpRequestException>(() => fixture.Catalog.GetAsync());
        }
        Assert.Equal(1, fixture.Api.Calls);
        fixture.Clock.Now += TimeSpan.FromSeconds(30);
        fixture.Api.Respond = _ => Task.FromResult(Cards("Recovered"));
        Assert.Equal("Recovered", Assert.Single(await fixture.Catalog.GetAsync()).Name);
        Assert.Equal(2, fixture.Api.Calls);
    }

    private static HttpResponseMessage Cards(string name) => new(HttpStatusCode.OK)
    {
        Content = new StringContent($$"""{"items":[{"id":1,"name":"{{name}}","maxLevel":16}]}""", Encoding.UTF8, "application/json"),
    };

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class Api : HttpMessageHandler
    {
        public int Calls;
        public Func<int, Task<HttpResponseMessage>> Respond { get; set; } = _ => Task.FromResult(Cards("Original"));
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Respond(Interlocked.Increment(ref Calls));
    }

    private sealed class Fixture : IDisposable
    {
        public Clock Clock { get; } = new();
        public Api Api { get; } = new();
        private readonly HttpClient _http;
        private readonly ServiceProvider _services;
        public CardCatalog Catalog { get; }

        public Fixture()
        {
            _http = new HttpClient(Api, disposeHandler: false) { BaseAddress = new Uri("https://catalog.test/") };
            _services = new ServiceCollection().AddSingleton(new ClashRoyaleClient(_http)).BuildServiceProvider();
            Catalog = new CardCatalog(_services.GetRequiredService<IServiceScopeFactory>(), Clock);
        }

        public void Dispose()
        {
            _services.Dispose();
            _http.Dispose();
            Api.Dispose();
        }
    }
}
