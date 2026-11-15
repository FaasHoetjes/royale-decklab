using System.Net;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>The last patch's card numbers are saved at the patch boundary, so they outlive its battles in the 30-day window.</summary>
public sealed class CardPeriodStorageTests : IDisposable
{
    private const long Day = 24L * 60 * 60 * 1000;
    private static readonly long Now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"cardperiods-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    private sealed class NoApi : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Forbidden));
    }

    private ServiceProvider Services()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddScoped<BattleRepository>();
        services.AddScoped<CrownSeriesRepository>();
        services.AddSingleton(new ClashRoyaleCrawlClient(
            new HttpClient(new NoApi()) { BaseAddress = new Uri("https://cr.test/v1/") }, new CrawlConcurrency()));
        services.AddSingleton(new ClashRoyaleClient(new HttpClient(new NoApi()) { BaseAddress = new Uri("https://cr.test/v1/") }));
        services.AddScoped<MetaBuilder>();
        services.AddSingleton<MetaCache>();
        return services.BuildServiceProvider();
    }

    /// <summary>One win with cards 1-8 per entry, played the given number of days ago; built just now, so nothing is crawled.</summary>
    private static async Task<MetaCache> StartAsync(ServiceProvider sp, params double[] daysAgo)
    {
        using (var scope = sp.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
            db.Database.EnsureCreated();
            db.MetaState.Add(new MetaStateEntity { Id = 1, LastBuildMs = Now });
            await db.SaveChangesAsync();

            await scope.ServiceProvider.GetRequiredService<BattleRepository>().MergeBattlesAsync(daysAgo.Select((d, i) =>
            {
                var ms = Now - (long)(d * Day);
                var time = DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z";
                return new BattleRecord
                {
                    Key = $"#P{i}|{time}",
                    BattleTime = time,
                    BattleTimeMs = BattleRepository.ParseBattleTime(time),
                    PlayerTag = $"#P{i}",
                    CardIds = Build.Eight(1),
                    Result = BattleResult.Win,
                    CardVersions = [],
                };
            }).ToList());
        }

        var cache = sp.GetRequiredService<MetaCache>();
        await cache.InitializeAsync();
        return cache;
    }

    private static T Store<T>(ServiceProvider sp, Func<BattleRepository, T> read)
    {
        using var scope = sp.CreateScope();
        return read(scope.ServiceProvider.GetRequiredService<BattleRepository>());
    }

    private static async Task PruneEverythingAsync(ServiceProvider sp)
    {
        using var scope = sp.CreateScope();
        await scope.ServiceProvider.GetRequiredService<BattleRepository>().PruneAsync(long.MaxValue);
    }

    [Fact]
    public async Task A_new_patch_saves_the_last_one_and_keeps_showing_it_after_its_battles_are_pruned()
    {
        using var sp = Services();
        var cache = await StartAsync(sp, 3, 2, 1);

        await cache.SetEpochAsync(Now);
        await PruneEverythingAsync(sp);
        await cache.AggregateFromStoreAsync("test");

        Assert.Equal(3, Store(sp, s => s.GetCardPeriod(Now))!.Battles);
        Assert.True(cache.CardStats.IsLastPatch);
        Assert.Equal(3, cache.CardStats.Battles);
        Assert.Equal(3, Assert.Single(cache.CardStats.Cards, c => c.Id == 1).Games);
    }

    [Fact]
    public async Task The_last_patch_starts_at_the_boundary_before_it()
    {
        using var sp = Services();
        var cache = await StartAsync(sp, 20, 10, 9);

        await cache.SetEpochAsync(Now - 15 * Day);
        await cache.SetEpochAsync(Now);

        var saved = Store(sp, s => s.GetCardPeriod(Now))!;
        Assert.Equal(Now - 15 * Day, saved.StartMs);
        Assert.Equal(2, saved.Battles);
    }

    [Fact]
    public async Task A_new_patch_is_saved_and_tallied()
    {
        using var sp = Services();
        var cache = await StartAsync(sp, 3, 2, 1);

        Assert.True(await cache.StartPatchAsync(Now - Day / 2, "test"));

        Assert.Equal(Now - Day / 2, Store(sp, s => s.GetEpochStart()));
        Assert.Equal(Now - Day / 2, cache.EpochStart);
        Assert.True(cache.CardStats.IsLastPatch);
        Assert.Equal(3, cache.CardStats.Battles);
    }

    [Theory]
    [InlineData(3.9)]
    [InlineData(-1)]
    public async Task A_new_patch_less_than_4_days_after_the_boundary_or_before_it_keeps_the_boundary(double daysLater)
    {
        using var sp = Services();
        var cache = await StartAsync(sp, 3, 2, 1);
        await cache.SetEpochAsync(Now - 5 * Day);

        Assert.False(await cache.StartPatchAsync(Now - 5 * Day + (long)(daysLater * Day), "test"));

        Assert.Equal(Now - 5 * Day, cache.EpochStart);
        Assert.Equal(0, Store(sp, s => s.GetPreviousEpochStart()));
    }

    [Fact]
    public async Task The_releases_of_October_and_November_2026_make_four_patches()
    {
        using var sp = Services();
        var cache = await StartAsync(sp);
        var patches = new List<long>();

        foreach (var release in new[]
                 {
                     "2026-10-05T09:00:00Z", // Season: Electro Wizard Hero
                     "2026-10-06T06:30:00Z", // Balance update
                     "2026-10-08T12:00:00Z", // Electro Giant Evo, from the Album Event
                     "2026-10-19T00:30:00Z", // Balance update
                     "2026-11-02T13:12:00Z", // Season: Giant Evo
                     "2026-11-09T10:52:00Z", // Mirror Evo, were it played enough to count
                 })
        {
            var ms = DateTimeOffset.Parse(release).ToUnixTimeMilliseconds();
            if (await cache.StartPatchAsync(ms, release))
            {
                patches.Add(ms);
            }
        }

        Assert.Equal(
            ["2026-10-05T09:00:00.000Z", "2026-10-19T00:30:00.000Z", "2026-11-02T13:12:00.000Z", "2026-11-09T10:52:00.000Z"],
            patches.Select(MetaCache.IsoMs));
        Assert.Equal(DateTimeOffset.Parse("2026-11-02T13:12:00Z").ToUnixTimeMilliseconds(), Store(sp, s => s.GetPreviousEpochStart()));
    }

    [Fact]
    public async Task A_store_opened_before_the_boundary_moved_reads_the_moved_boundary()
    {
        using var sp = Services();
        var cache = await StartAsync(sp, 3, 2, 1);
        await cache.SetEpochAsync(Now - 10 * Day);
        using var rebuild = sp.CreateScope();
        var store = rebuild.ServiceProvider.GetRequiredService<BattleRepository>();
        Assert.Equal(Now - 10 * Day, store.GetEpochStart());

        await cache.StartPatchAsync(Now - Day, "test");

        Assert.Equal(Now - Day, store.GetEpochStart());
        Assert.Equal(Now - 10 * Day, store.GetPreviousEpochStart());
    }

    [Fact]
    public async Task A_patch_boundary_that_couldnt_be_saved_isnt_applied()
    {
        using var sp = Services();
        var cache = await StartAsync(sp, 3, 2, 1);
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => cache.StartPatchAsync(Now, "test", cancelled.Token));

        Assert.Equal(0, cache.EpochStart);
        Assert.Equal(0, Store(sp, s => s.GetEpochStart()));
    }

    [Fact]
    public async Task A_saved_patch_is_only_replaced_by_a_tally_with_more_battles()
    {
        using var sp = Services();
        var cache = await StartAsync(sp, 3, 2, 1);
        await cache.SetEpochAsync(Now);

        using (var scope = sp.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<BattleRepository>().PruneAsync(Now - (long)(1.5 * Day));
        }
        await cache.AggregateFromStoreAsync("after pruning");

        Assert.Equal(3, Store(sp, s => s.GetCardPeriod(Now))!.Battles);
    }

    [Fact]
    public async Task Before_any_patch_boundary_every_stored_battle_counts_and_there_is_no_change()
    {
        using var sp = Services();
        var cache = await StartAsync(sp, 3, 2);

        Assert.Null(cache.CardStats.Since);
        Assert.False(cache.CardStats.IsLastPatch);
        Assert.Equal(2, cache.CardStats.Battles);
        Assert.Null(Assert.Single(cache.CardStats.Cards, c => c.Id == 1).WinRateChange);
    }
}
