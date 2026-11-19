using System.Net;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Routing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Controllers;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>Stored battles may only be pruned once a fresh crawl has landed, so a failed crawl never empties the store.</summary>
public sealed class MetaCacheTests : IDisposable
{
    private static readonly int[] OldDeck = [1, 2, 3, 4, 5, 6, 7, 8];
    private static readonly long Now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private static readonly long FortyDaysAgo = Now - 40L * 24 * 60 * 60 * 1000;

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"metacache-{Guid.NewGuid():N}.db");
    private readonly string _ladderDbPath = Path.Combine(Path.GetTempPath(), $"metacache-ladder-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
        foreach (var suffix in new[] { "", "-wal", "-shm" })
        {
            File.Delete(_ladderDbPath + suffix);
        }
    }

    /// <summary>
    /// Answers the crawl's three calls with one clan, one member and one war battle played now, and lists cards 1-28:
    /// card 1 with an Evo and a Hero, card 2 a champion.
    /// </summary>
    private sealed class CrawlHandler(bool fail) : HttpMessageHandler
    {
        public bool CatalogFails { get; set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = request.RequestUri!.AbsolutePath;
            if (fail || (CatalogFails && path.EndsWith("/cards")))
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Forbidden));
            }

            var json = path.EndsWith("/cards") ? """{"items":[""" + string.Join(',', Enumerable.Range(1, 28).Select(Catalogued)) + "]}"
                : path.Contains("/rankings/") ? """{"items":[{"tag":"#CLAN"}]}"""
                : path.Contains("/clans/") ? """{"memberList":[{"tag":"#P1"}]}"""
                : $$"""
                  [{
                    "type": "riverRacePvP",
                    "battleTime": "{{DateTime.UtcNow:yyyyMMdd'T'HHmmss}}.000Z",
                    "gameMode": { "name": "CW_Battle_1v1" },
                    "team": [{ "tag": "#P1", "crowns": 1, "cards": {{Cards(11)}} }],
                    "opponent": [{ "tag": "#P2", "crowns": 0, "cards": {{Cards(21)}} }]
                  }]
                  """;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            });
        }

        private static string Catalogued(int id) => id switch
        {
            1 => """{"id":1,"name":"C1","maxLevel":16,"maxEvolutionLevel":3}""",
            2 => """{"id":2,"name":"C2","maxLevel":16,"rarity":"Champion"}""",
            _ => $$"""{"id":{{id}},"name":"C{{id}}","maxLevel":16}""",
        };

        private static string Cards(int firstId)
            => "[" + string.Join(',', Enumerable.Range(firstId, 8).Select(id => $$"""{"id":{{id}}}""")) + "]";
    }

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private CrawlHandler _crawl = null!;
    private readonly Clock _clock = new();

    private ServiceProvider Services(bool crawlFails)
    {
        _crawl = new CrawlHandler(crawlFails);
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new LadderOptions()));
        services.AddSingleton(_ => new LadderStore(_ladderDbPath));
        services.AddSingleton<LadderIntake>();
        services.AddScoped<BattleRepository>();
        services.AddScoped<CrownSeriesRepository>();
        services.AddSingleton(new ClashRoyaleCrawlClient(
            new HttpClient(_crawl) { BaseAddress = new Uri("https://cr.test/v1/") }, new CrawlConcurrency()));
        services.AddSingleton(new ClashRoyaleClient(
            new HttpClient(_crawl) { BaseAddress = new Uri("https://cr.test/v1/") }));
        services.AddScoped<MetaBuilder>();
        services.AddSingleton<TimeProvider>(_clock);
        services.AddSingleton<CardCatalog>();
        services.AddSingleton<CardReleases>();
        services.AddSingleton<MetaCache>();
        return services.BuildServiceProvider();
    }

    /// <summary>Three battles from 40 days ago, older than the 30-day window, last built when <paramref name="lastBuildMs"/>.</summary>
    private static async Task SeedOldBattlesAsync(ServiceProvider sp, long lastBuildMs)
    {
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
        db.Database.EnsureCreated();
        db.MetaState.Add(new MetaStateEntity { Id = 1, LastBuildMs = lastBuildMs });
        await db.SaveChangesAsync();

        var time = DateTimeOffset.FromUnixTimeMilliseconds(FortyDaysAgo).UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z";
        var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
        await store.MergeBattlesAsync(Enumerable.Range(1, 3).Select(i => new BattleRecord
        {
            Key = $"#OLD{i}|{time}",
            BattleTime = time,
            BattleTimeMs = FortyDaysAgo,
            PlayerTag = $"#OLD{i}",
            CardIds = OldDeck,
            Result = BattleResult.Win,
            CardVersions = [],
        }).ToList());
    }

    private static List<BattleRecord> StoredBattles(ServiceProvider sp)
    {
        using var scope = sp.CreateScope();
        return scope.ServiceProvider.GetRequiredService<BattleRepository>().AllBattles().ToList();
    }

    [Fact]
    public async Task Stale_battles_survive_a_failed_crawl_and_keep_being_served()
    {
        using var sp = Services(crawlFails: true);
        await SeedOldBattlesAsync(sp, lastBuildMs: FortyDaysAgo);
        var cache = sp.GetRequiredService<MetaCache>();

        await cache.InitializeAsync();

        Assert.Equal(3, StoredBattles(sp).Count);
        Assert.Contains(cache.Meta, d => d.CardIds.SequenceEqual(OldDeck));
    }

    [Fact]
    public async Task Stale_battles_are_pruned_once_a_crawl_succeeds()
    {
        using var sp = Services(crawlFails: false);
        await SeedOldBattlesAsync(sp, lastBuildMs: FortyDaysAgo);
        var cache = sp.GetRequiredService<MetaCache>();

        await cache.InitializeAsync();

        var stored = StoredBattles(sp);
        Assert.Equal(["#P1", "#P2"], stored.Select(b => b.PlayerTag).Order());
        Assert.DoesNotContain(cache.Meta, d => d.CardIds.SequenceEqual(OldDeck));
        Assert.True(cache.LastCacheTime > FortyDaysAgo);
    }

    [Fact]
    public async Task Both_sides_of_a_war_battle_point_at_each_other()
    {
        using var sp = Services(crawlFails: false);
        await SeedOldBattlesAsync(sp, lastBuildMs: FortyDaysAgo);

        await sp.GetRequiredService<MetaCache>().InitializeAsync();

        var stored = StoredBattles(sp).ToDictionary(b => b.PlayerTag);
        Assert.Equal(stored["#P2"].Key, stored["#P1"].OpponentKey);
        Assert.Equal(stored["#P1"].Key, stored["#P2"].OpponentKey);
    }

    private static HashSet<CardVersion> KnownVersions(ServiceProvider sp)
    {
        using var scope = sp.CreateScope();
        return scope.ServiceProvider.GetRequiredService<BattleRepository>().GetKnownCardVersions();
    }

    private const long Day = 24L * 60 * 60 * 1000;

    private static BattleRecord Battle(string tag, long ms, params CardVersion[] versions)
    {
        var time = DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z";
        return new BattleRecord
        {
            Key = $"{tag}|{time}",
            BattleTime = time,
            BattleTimeMs = BattleRepository.ParseBattleTime(time),
            PlayerTag = tag,
            CardIds = [.. versions.Select(v => v.CardId).Concat(Enumerable.Range(3, 8 - versions.Length))],
            Result = BattleResult.Win,
            CardVersions = [.. versions.Where(v => v.Version != CardVersionKind.Normal)],
        };
    }

    /// <summary>A stored battle from two days ago with card 99, which the catalog doesn't list, played as an Evo.</summary>
    private static async Task StoreRecentEvoBattleAsync(ServiceProvider sp)
    {
        using var scope = sp.CreateScope();
        await scope.ServiceProvider.GetRequiredService<BattleRepository>().MergeBattlesAsync(
            [Battle("#RECENT", Now - 2 * Day, new CardVersion(99, CardVersionKind.Evo))]);
    }

    [Fact]
    public async Task The_first_crawl_remembers_the_catalog_and_stored_versions_without_starting_a_patch()
    {
        using var sp = Services(crawlFails: false);
        await SeedOldBattlesAsync(sp, lastBuildMs: FortyDaysAgo);
        await StoreRecentEvoBattleAsync(sp);
        var cache = sp.GetRequiredService<MetaCache>();

        await cache.InitializeAsync();

        Assert.Equal(0, cache.EpochStart);
        var known = KnownVersions(sp);
        Assert.Contains(new CardVersion(1, CardVersionKind.Evo), known);
        Assert.Contains(new CardVersion(1, CardVersionKind.Hero), known);
        Assert.Contains(new CardVersion(2, CardVersionKind.Hero), known);
        Assert.DoesNotContain(new CardVersion(3, CardVersionKind.Evo), known);
        Assert.Contains(new CardVersion(99, CardVersionKind.Evo), known);
    }

    [Fact]
    public async Task Without_the_catalog_nothing_is_remembered_or_started_until_a_later_crawl_gets_it()
    {
        using var sp = Services(crawlFails: false);
        await SeedOldBattlesAsync(sp, lastBuildMs: FortyDaysAgo);
        _crawl.CatalogFails = true;
        var cache = sp.GetRequiredService<MetaCache>();
        await cache.InitializeAsync();
        Assert.Empty(KnownVersions(sp));

        _crawl.CatalogFails = false;
        _clock.Now += TimeSpan.FromMinutes(5);
        await cache.RebuildAsync("test");

        Assert.Equal(0, cache.EpochStart);
        Assert.Contains(new CardVersion(28, CardVersionKind.Normal), KnownVersions(sp));
    }

    [Fact]
    public async Task A_card_version_played_for_a_day_starts_a_patch_at_its_first_battle()
    {
        using var sp = Services(crawlFails: false);
        await SeedOldBattlesAsync(sp, lastBuildMs: FortyDaysAgo);
        using (var scope = sp.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<BattleRepository>().AddKnownCardVersionsAsync(
                Enumerable.Range(1, 27).Select(id => new CardVersion(id, CardVersionKind.Normal)));
        }
        var cache = sp.GetRequiredService<MetaCache>();
        await cache.InitializeAsync();
        Assert.Equal(0, cache.EpochStart);
        Assert.DoesNotContain(new CardVersion(28, CardVersionKind.Normal), KnownVersions(sp));

        _clock.Now += TimeSpan.FromDays(1.5);
        await cache.RebuildAsync("test");

        Assert.Equal(StoredBattles(sp).Where(b => b.PlayerTag == "#P2").Min(b => b.BattleTimeMs), cache.EpochStart);
        Assert.Contains(new CardVersion(28, CardVersionKind.Normal), KnownVersions(sp));
    }

    /// <summary>
    /// The last three days' 100 decks: <paramref name="newDecks"/> with card 28's Evo, first in the oldest deck,
    /// then 40 with card 1's Evo and 20 with card 2's Hero, the versions already out.
    /// </summary>
    private static async Task<(BattleRepository Store, BattleRecord First)> WeekWithNewEvoAsync(IServiceScope scope, int newDecks)
    {
        var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
        await store.AddKnownCardVersionsAsync(
        [
            .. Enumerable.Range(1, 28).Select(id => new CardVersion(id, CardVersionKind.Normal)),
            new CardVersion(1, CardVersionKind.Evo),
            new CardVersion(2, CardVersionKind.Hero),
        ]);
        var battles = Enumerable.Range(0, 100).Select(i =>
        {
            var ms = Now - 3 * Day + i * (3 * Day / 100);
            return i < newDecks ? Battle($"#NEW{i}", ms, new CardVersion(28, CardVersionKind.Evo))
                : i < 40 + newDecks ? Battle($"#EVO{i}", ms, new CardVersion(1, CardVersionKind.Evo))
                : i < 60 + newDecks ? Battle($"#HERO{i}", ms, new CardVersion(2, CardVersionKind.Hero))
                : Battle($"#PLAIN{i}", ms);
        }).ToList();
        await store.MergeBattlesAsync(battles);
        return (store, battles[0]);
    }

    [Fact]
    public async Task A_card_version_in_fewer_decks_than_the_versions_already_out_isnt_released()
    {
        using var sp = Services(crawlFails: false);
        await SeedOldBattlesAsync(sp, lastBuildMs: FortyDaysAgo);
        using var scope = sp.CreateScope();
        var (store, first) = await WeekWithNewEvoAsync(scope, newDecks: 10);

        Assert.Null(await scope.ServiceProvider.GetRequiredService<CardReleases>().FindNewAsync(store, [first], default));
    }

    [Fact]
    public async Task A_card_version_under_the_bar_is_measured_again_only_after_twelve_hours()
    {
        using var sp = Services(crawlFails: false);
        await SeedOldBattlesAsync(sp, lastBuildMs: FortyDaysAgo);
        using var scope = sp.CreateScope();
        var (store, first) = await WeekWithNewEvoAsync(scope, newDecks: 10);
        var releases = scope.ServiceProvider.GetRequiredService<CardReleases>();
        Assert.Null(await releases.FindNewAsync(store, [first], default));

        await store.MergeBattlesAsync([.. Enumerable.Range(0, 20).Select(i =>
            Battle($"#LATE{i}", Now - Day + i * 1000, new CardVersion(28, CardVersionKind.Evo)))]);

        Assert.Null(await releases.FindNewAsync(store, [first], default));
        _clock.Now += TimeSpan.FromHours(12);
        Assert.Equal(first.BattleTimeMs, (await releases.FindNewAsync(store, [first], default))?.FirstSeenMs);
    }

    [Fact]
    public async Task A_card_version_in_as_many_decks_as_the_versions_already_out_is_released_at_its_first_battle()
    {
        using var sp = Services(crawlFails: false);
        await SeedOldBattlesAsync(sp, lastBuildMs: FortyDaysAgo);
        using var scope = sp.CreateScope();
        var (store, first) = await WeekWithNewEvoAsync(scope, newDecks: 20);

        var release = await scope.ServiceProvider.GetRequiredService<CardReleases>().FindNewAsync(store, [first], default);

        Assert.Equal(first.BattleTimeMs, release?.FirstSeenMs);
        Assert.Equal([new CardVersion(28, CardVersionKind.Evo)], release!.Versions);
    }

    [Fact]
    public async Task A_patch_boundary_update_does_not_prune()
    {
        using var sp = Services(crawlFails: true);
        await SeedOldBattlesAsync(sp, lastBuildMs: Now);
        var cache = sp.GetRequiredService<MetaCache>();
        await cache.InitializeAsync();

        await cache.SetEpochAsync(Now);

        Assert.Equal(3, StoredBattles(sp).Count);
    }

    [Fact]
    public async Task A_manual_refresh_whose_crawl_fails_says_so_and_keeps_the_meta()
    {
        using var sp = Services(crawlFails: true);
        await SeedOldBattlesAsync(sp, lastBuildMs: Now);
        var cache = sp.GetRequiredService<MetaCache>();
        await cache.InitializeAsync();

        var controller = new MetaController(cache);
        var result = Assert.IsType<ObjectResult>(await controller.Refresh());

        Assert.Equal(StatusCodes.Status502BadGateway, result.StatusCode);
        Assert.Contains(cache.Meta, d => d.CardIds.SequenceEqual(OldDeck));
    }

    [Fact]
    public async Task A_manual_refresh_whose_crawl_succeeds_says_refreshed()
    {
        using var sp = Services(crawlFails: false);
        await SeedOldBattlesAsync(sp, lastBuildMs: Now);
        var cache = sp.GetRequiredService<MetaCache>();
        await cache.InitializeAsync();

        var controller = new MetaController(cache);

        Assert.IsType<OkObjectResult>(await controller.Refresh());
    }

    private static ResourceExecutingContext RunMetaFilter(ServiceProvider sp)
    {
        var http = new DefaultHttpContext { RequestServices = sp };
        var context = new ResourceExecutingContext(
            new ActionContext(http, new RouteData(), new ActionDescriptor()),
            new List<IFilterMetadata>(),
            new List<IValueProviderFactory>());
        new RequireMetaLoadedAttribute().OnResourceExecuting(context);
        return context;
    }

    [Fact]
    public async Task Meta_endpoints_answer_an_uncacheable_503_until_the_stored_battles_are_loaded()
    {
        using var sp = Services(crawlFails: true);
        await SeedOldBattlesAsync(sp, lastBuildMs: Now);
        var cache = sp.GetRequiredService<MetaCache>();

        var loading = RunMetaFilter(sp);
        var result = Assert.IsType<ObjectResult>(loading.Result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, result.StatusCode);
        Assert.Equal("no-store", loading.HttpContext.Response.Headers.CacheControl.ToString());
        Assert.Equal("15", loading.HttpContext.Response.Headers.RetryAfter.ToString());

        await cache.InitializeAsync();

        Assert.Null(RunMetaFilter(sp).Result);
    }

    [Fact]
    public async Task An_empty_store_with_a_failed_crawl_still_counts_as_loaded()
    {
        using var sp = Services(crawlFails: true);
        using (var scope = sp.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
            db.Database.EnsureCreated();
            db.MetaState.Add(new MetaStateEntity { Id = 1 });
            await db.SaveChangesAsync();
        }
        var cache = sp.GetRequiredService<MetaCache>();

        await cache.InitializeAsync();

        Assert.True(cache.IsLoaded);
        Assert.Empty(cache.Meta);
    }
}
