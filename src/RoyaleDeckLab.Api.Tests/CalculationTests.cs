using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CalculationTests
{
    private sealed class Clock : TimeProvider
    {
        public long Ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => Ticks;
    }

    [Fact]
    public async Task ConcurrentCallersShareWork_AndCancellationOnlyEndsOneWait()
    {
        var cache = new CalculationCache<int>(TimeProvider.System);
        var pending = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;
        Task<int> Compute() { calls++; return pending.Task; }
        using var cancelled = new CancellationTokenSource();
        var first = cache.GetAsync("same", Compute, cancelled.Token);
        var second = cache.GetAsync("same", Compute);
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        pending.SetResult(42);
        Assert.Equal(42, await second);
        Assert.Equal(42, await cache.GetAsync("same", Compute));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task CapacityPreservesInFlightWork_AndEvictsCompletedResults()
    {
        var cache = new CalculationCache<int>(TimeProvider.System, capacity: 1);
        var pending = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = cache.GetAsync("first", () => pending.Task);
        await Assert.ThrowsAsync<CalculationBusyException>(() => cache.GetAsync("second", () => Task.FromResult(2)));
        pending.SetResult(1);
        Assert.Equal(1, await first);
        Assert.Equal(2, await cache.GetAsync("second", () => Task.FromResult(2)));
    }

    [Fact]
    public async Task TtlStartsAtCompletion_AndFailedWorkCanBeRetried()
    {
        var clock = new Clock();
        var cache = new CalculationCache<int>(clock);
        var pending = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = cache.GetAsync("key", () => pending.Task);
        clock.Ticks += TimeSpan.FromMinutes(2).Ticks;
        var second = cache.GetAsync("key", () => throw new Exception("Duplicated running work"));
        pending.SetResult(1);
        await Task.WhenAll(first, second);
        Assert.Equal(1, await cache.GetAsync("key", () => Task.FromResult(2)));
        clock.Ticks += TimeSpan.FromSeconds(61).Ticks;
        Assert.Equal(2, await cache.GetAsync("key", () => Task.FromResult(2)));
        await Assert.ThrowsAsync<InvalidOperationException>(() => cache.GetAsync("failed",
            () => Task.FromException<int>(new InvalidOperationException())));
        Assert.Equal(3, await cache.GetAsync("failed", () => Task.FromResult(3)));
    }

    [Fact]
    public async Task SchedulerBoundsConcurrencyAndQueue_ThenReleasesCapacity()
    {
        using var scheduler = new CalculationScheduler(1, 1, TimeSpan.FromSeconds(5));
        using var started = new ManualResetEventSlim();
        using var release = new ManualResetEventSlim();
        var first = scheduler.RunAsync(ct => { started.Set(); release.Wait(ct); return 1; });
        Assert.True(started.Wait(TimeSpan.FromSeconds(2)));
        try
        {
            var queued = scheduler.RunAsync(_ => 2);
            await Assert.ThrowsAsync<CalculationBusyException>(() => scheduler.RunAsync(_ => 3));
            release.Set();
            Assert.Equal(1, await first);
            Assert.Equal(2, await queued);
            Assert.Equal(4, await scheduler.RunAsync(_ => 4));
        }
        finally { release.Set(); }
    }

    [Fact]
    public async Task SchedulerDeadlineCancelsCpuWorkAndReleasesCapacity()
    {
        using var scheduler = new CalculationScheduler(1, 1, TimeSpan.FromMilliseconds(100));
        await Assert.ThrowsAsync<CalculationBusyException>(() => scheduler.RunAsync<int>(ct =>
        {
            ct.WaitHandle.WaitOne();
            ct.ThrowIfCancellationRequested();
            return 0;
        }));
        Assert.Equal(1, await scheduler.RunAsync(_ => 1));
    }

    [Fact]
    public void KeysNormalizeOptions_AndChangeWithCollectionOrMeta()
    {
        var player = new CrPlayer("#PLAYER", "Player", [], null);
        var a = new LineupOptions { BannedCards = new HashSet<int> { 3, 2 }, RequiredCards = new HashSet<int> { 7, 1 } };
        var b = new LineupOptions { BannedCards = new HashSet<int> { 2, 3 }, RequiredCards = new HashSet<int> { 1, 7 } };
        Assert.Equal(PlayerCalculationKey.Create(player, 1, a), PlayerCalculationKey.Create(player, 1, b));
        Assert.NotEqual(PlayerCalculationKey.Create(player, 1, a), PlayerCalculationKey.Create(player, 2, a));
        Assert.NotEqual(PlayerCalculationKey.Create(player, 1, a), PlayerCalculationKey.Create(player, 1, a with { DeckCount = 3 }));
        var card = new CrPlayerCard(1, "Card", 10, 14, 0, 3, null, "common", null, null, null);
        var owned = player with { Cards = [card] };
        var upgraded = player with { Cards = [card with { Level = 11 }] };
        Assert.NotEqual(PlayerCalculationKey.Create(owned, 1), PlayerCalculationKey.Create(upgraded, 1));
        Assert.NotEqual(PlayerCalculationKey.Create(owned, 1), PlayerCalculationKey.Create(owned with
            { Cards = [card with { EvolutionLevel = 1 }] }, 1));
    }
}
