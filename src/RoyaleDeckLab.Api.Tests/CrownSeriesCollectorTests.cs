using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Polly.CircuitBreaker;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CrownSeriesCollectorTests : IDisposable
{
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 12, 0, 0, TimeSpan.Zero);

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"crownseries-{Guid.NewGuid():N}.db");
    private readonly FakeApi _api = new();
    private readonly FakeClock _clock = new();
    private readonly ServiceProvider _services;

    public CrownSeriesCollectorTests()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new CrownSeriesOptions { ProbePlayers = 1 }));
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddScoped<CrownSeriesRepository>();
        services.AddSingleton(new ClashRoyaleCrawlClient(
            new HttpClient(_api) { BaseAddress = new Uri("https://cr.test/v1/") }, new CrawlConcurrency()));
        services.AddSingleton<TimeProvider>(_clock);
        services.AddSingleton<CrownSeriesSchedule>();
        services.AddScoped<CrownSeriesCollector>();
        _services = services.BuildServiceProvider();

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
        db.Database.EnsureCreated();
        db.MetaState.Add(new MetaStateEntity { Id = 1 });
        db.SaveChanges();
    }

    public void Dispose()
    {
        _services.Dispose();
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    private sealed class FakeClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = CrownSeriesCollectorTests.Now;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class FakeApi : HttpMessageHandler
    {
        public List<string> Ranked { get; } = [];
        public Dictionary<string, List<object>> Logs { get; } = [];
        public HashSet<string> Refused { get; } = [];
        public ConcurrentBag<string> LogsRead { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = Uri.UnescapeDataString(request.RequestUri?.AbsolutePath ?? "");
            object body = new { items = Ranked.Select(tag => new { tag }) };
            if (path.EndsWith("/battlelog"))
            {
                var tag = path.Split('/')[^2];
                if (Refused.Contains(tag))
                {
                    throw new BrokenCircuitException();
                }
                LogsRead.Add(tag);
                body = Logs.GetValueOrDefault(tag) ?? [];
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            });
        }
    }

    private static object Duel(string tag, string opponentTag, TimeSpan ago)
    {
        static object Round(int crowns, int firstId) => new
        {
            crowns,
            cards = Enumerable.Range(firstId, 8).Select(id => new { id, level = 14, maxLevel = 14, rarity = "Rare" }),
        };

        return new
        {
            type = "unknown",
            battleTime = (Now - ago).UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z",
            gameMode = new { id = 72000513, name = "Competitive_Multideck" },
            deckSelection = "quadDeckPick",
            eventTag = "#EVENT",
            leagueNumber = 1,
            team = new[] { new { tag, crowns = 2, rounds = new[] { Round(1, 1), Round(1, 11) } } },
            opponent = new[] { new { tag = opponentTag, crowns = 0, rounds = new[] { Round(0, 21), Round(0, 31) } } },
        };
    }

    private async Task CollectAsync()
    {
        using var scope = _services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<CrownSeriesCollector>().CollectAsync();
    }

    private List<CrownSeriesRound> Stored()
    {
        using var scope = _services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().RoundsSince(0).ToList();
    }

    private long LastPollMs()
    {
        using var scope = _services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().GetLastPollMs();
    }

    [Fact]
    public async Task Stores_the_duels_of_ranked_players_and_of_their_opponents()
    {
        _api.Ranked.AddRange(["#R1", "#R2"]);
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        _api.Logs["#OPP"] = [Duel("#OPP", "#R1", TimeSpan.FromHours(1)), Duel("#OPP", "#DEEP", TimeSpan.FromHours(2))];

        await CollectAsync();

        var stored = Stored();
        Assert.Equal(8, stored.Count);
        Assert.Equal(["#DEEP", "#OPP", "#R1"], stored.Select(r => r.PlayerTag).Distinct().Order());
        Assert.Equal(["#OPP", "#R1", "#R2"], _api.LogsRead.Order());
        Assert.Equal(Now.ToUnixTimeMilliseconds(), LastPollMs());
    }

    [Fact]
    public async Task A_log_that_fills_slowly_is_not_read_again_next_hour()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1)), Duel("#R1", "#OPP", TimeSpan.FromHours(30))];
        _api.Logs["#FAST"] = [Duel("#FAST", "#R1", TimeSpan.FromHours(1)), Duel("#FAST", "#R1", TimeSpan.FromHours(2))];
        _api.Logs["#R1"].Add(Duel("#R1", "#FAST", TimeSpan.FromHours(1.5)));

        await CollectAsync();
        _clock.Now = Now.AddHours(1);
        _api.LogsRead.Clear();
        await CollectAsync();

        Assert.Equal(["#FAST"], _api.LogsRead);
    }

    [Fact]
    public async Task Stores_each_round_once_however_often_it_is_polled()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        _api.Logs["#OPP"] = [Duel("#OPP", "#R1", TimeSpan.FromHours(1))];

        await CollectAsync();
        _clock.Now = Now.AddHours(9);
        await CollectAsync();

        Assert.Equal(4, Stored().Count);
    }

    [Fact]
    public async Task Off_a_duel_weekend_only_the_probe_players_are_read()
    {
        _api.Ranked.AddRange(["#R1", "#R2"]);
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromDays(3))];

        await CollectAsync();

        Assert.Equal(["#R1"], _api.LogsRead);
        Assert.Equal(Now.ToUnixTimeMilliseconds(), LastPollMs());
    }

    [Fact]
    public async Task The_probe_reads_the_players_who_played_most_duels()
    {
        _api.Ranked.AddRange(["#R1", "#R2"]);
        _api.Logs["#R1"] = [Duel("#R1", "#ACTIVE", TimeSpan.FromDays(3))];
        _api.Logs["#ACTIVE"] = [Duel("#ACTIVE", "#R2", TimeSpan.FromDays(3.1)), Duel("#ACTIVE", "#R1", TimeSpan.FromDays(3.5))];
        _clock.Now = Now.AddDays(-3).AddHours(1);
        await CollectAsync();
        _clock.Now = Now;
        _api.LogsRead.Clear();

        await CollectAsync();

        Assert.Equal(["#ACTIVE"], _api.LogsRead);
    }

    [Fact]
    public async Task A_refusing_api_stops_the_poll_and_keeps_what_was_read()
    {
        _api.Ranked.AddRange(["#R1", "#R2"]);
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        _api.Refused.Add("#R2");

        await CollectAsync();

        Assert.Equal(4, Stored().Count);
        Assert.DoesNotContain("#OPP", _api.LogsRead);
    }

    [Fact]
    public async Task Rounds_older_than_the_battle_window_are_pruned()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OLD", TimeSpan.FromDays(40)), Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        await CollectAsync();
        _clock.Now = Now.AddHours(9);

        await CollectAsync();

        Assert.DoesNotContain(Stored(), r => r.PlayerTag == "#OLD");
        Assert.Contains(Stored(), r => r.PlayerTag == "#OPP");
    }
}
