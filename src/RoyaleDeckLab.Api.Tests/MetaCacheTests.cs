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

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    /// <summary>Answers the crawl's three calls with one clan, one member and one war battle played now.</summary>
    private sealed class CrawlHandler(bool fail) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (fail)
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Forbidden));
            }

            var path = request.RequestUri!.AbsolutePath;
            var json = path.Contains("/rankings/") ? """{"items":[{"tag":"#CLAN"}]}"""
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

        private static string Cards(int firstId)
            => "[" + string.Join(',', Enumerable.Range(firstId, 8).Select(id => $$"""{"id":{{id}}}""")) + "]";
    }

    private ServiceProvider Services(bool crawlFails)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddScoped<BattleRepository>();
        services.AddSingleton(new ClashRoyaleClient(
            new HttpClient(new CrawlHandler(crawlFails)) { BaseAddress = new Uri("https://cr.test/v1/") }));
        services.AddScoped<MetaBuilder>();
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

        using var scope = sp.CreateScope();
        var controller = new MetaController(cache, scope.ServiceProvider.GetRequiredService<BattleRepository>());
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

        using var scope = sp.CreateScope();
        var controller = new MetaController(cache, scope.ServiceProvider.GetRequiredService<BattleRepository>());

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
