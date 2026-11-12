using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;
using Microsoft.Extensions.Logging.Abstractions;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ClanCacheConcurrencyTests
{
    [Theory]
    [InlineData(false, 3)]
    [InlineData(true, 1)]
    public async Task OverlappingColdMisses_ShareOneFetch(bool search, int expectedCalls)
    {
        using var memory = new OverlappingMissCache();
        using var api = new StubApi();
        var fetch = CreateFetch(search, memory, api);
        var first = Task.Factory.StartNew(() => fetch(CancellationToken.None), CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default).Unwrap();
        var second = Task.Factory.StartNew(() => fetch(CancellationToken.None), CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default).Unwrap();
        await Task.WhenAll(first, second).WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(expectedCalls, api.Calls);
    }

    [Theory]
    [InlineData(false, 3)]
    [InlineData(true, 1)]
    public async Task CancelledWaiter_DoesNotCancelOrEvictSharedFetch(bool search, int expectedCalls)
    {
        using var memory = new MemoryCache(new MemoryCacheOptions());
        using var api = new StubApi { HoldResponses = true };
        var fetch = CreateFetch(search, memory, api);
        using var cancelled = new CancellationTokenSource();
        var first = fetch(cancelled.Token);
        var second = fetch(CancellationToken.None);
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        api.Release.TrySetResult();
        await second.WaitAsync(TimeSpan.FromSeconds(10));
        await fetch(CancellationToken.None);
        Assert.Equal(expectedCalls, api.Calls);
    }

    private static Func<CancellationToken, Task> CreateFetch(bool search, IMemoryCache memory, StubApi api)
    {
        var factory = new StubFactory(api);
        if (search)
        {
            var cache = new ClanSearchCache(factory, memory);
            return ct => cache.SearchAsync("dutch", ct);
        }
        Assert.True(ClanTag.TryParse("L9VRJ", out var tag));
        var wars = new ClanWarCache(factory, memory, TimeProvider.System, new ClanHistoryCache(factory, TimeProvider.System), NullLogger<ClanWarCache>.Instance);
        return ct => wars.GetAsync(tag, ct);
    }

    private sealed class OverlappingMissCache : IMemoryCache
    {
        private readonly MemoryCache _inner = new(new MemoryCacheOptions());
        private readonly Barrier _misses = new(2);
        private int _lookups;
        public bool TryGetValue(object key, out object? value)
        {
            var found = _inner.TryGetValue(key, out value);
            if (!found && Interlocked.Increment(ref _lookups) <= 2)
                _misses.SignalAndWait(TimeSpan.FromMilliseconds(500));
            return found;
        }
        public ICacheEntry CreateEntry(object key) => _inner.CreateEntry(key);
        public void Remove(object key) => _inner.Remove(key);
        public void Dispose() { _inner.Dispose(); _misses.Dispose(); }
    }

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false) { BaseAddress = new Uri("https://cr.test/v1/") };
    }

    private sealed class StubApi : HttpMessageHandler
    {
        public int Calls;
        public bool HoldResponses;
        public readonly TaskCompletionSource Release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls);
            if (HoldResponses) await Release.Task.WaitAsync(ct);
            var path = request.RequestUri!.AbsolutePath;
            var body = path.EndsWith("/currentriverrace", StringComparison.Ordinal)
                ? """{"periodType":"warDay","periodIndex":3,"clan":{"tag":"#L9VRJ","name":"Example"},"clans":[]}"""
                : path.EndsWith("/riverracelog", StringComparison.Ordinal) || request.RequestUri.Query.Contains("name=", StringComparison.Ordinal)
                    ? """{"items":[]}"""
                    : """{"tag":"#L9VRJ","name":"Example","memberList":[]}""";
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }
}
