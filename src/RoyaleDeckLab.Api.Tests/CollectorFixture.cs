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
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>Both player polls against a fake CR API, with their own temporary databases.</summary>
public abstract class CollectorFixture : IDisposable
{
    protected static readonly DateTimeOffset Now = new(2026, 11, 15, 12, 0, 0, TimeSpan.Zero);

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"collector-{Guid.NewGuid():N}.db");
    private readonly TestLadder _ladder = new();
    private ServiceProvider? _services;

    protected FakeApi Api { get; } = new();

    protected FakeClock Clock { get; } = new(Now);

    protected CrownSeriesOptions CrownSeries { get; } = new() { ProbePlayers = 1 };

    protected LadderOptions LadderOptions { get; } = new();

    protected ServiceProvider Services => _services ??= Build();

    protected void BreakLadderStore() => _ladder.Break();

    private ServiceProvider Build()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(CrownSeries));
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        _ladder.AddTo(services, LadderOptions);
        services.AddScoped<CrownSeriesRepository>();
        services.AddScoped<BattleRepository>();
        services.AddSingleton(new ClashRoyaleCrawlClient(
            new HttpClient(Api) { BaseAddress = new Uri("https://cr.test/v1/") }, new CrawlConcurrency()));
        services.AddSingleton<TimeProvider>(Clock);
        services.AddSingleton<CrownSeriesSchedule>();
        services.AddScoped<CrownSeriesCollector>();
        services.AddSingleton<LadderSchedule>();
        services.AddScoped<LadderCollector>();
        services.AddSingleton<VisitorSeeds>();
        var provider = services.BuildServiceProvider();

        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
        db.Database.EnsureCreated();
        db.MetaState.Add(new MetaStateEntity { Id = 1 });
        db.SaveChanges();
        return provider;
    }

    protected static string BattleTime(TimeSpan ago) => (Now - ago).UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z";

    protected static object TrophyRoadBattle(
        string tag, string opponentTag, TimeSpan ago, int trophies = 6000, int? opponentTrophies = null, string? clanTag = null)
        => LadderBattle("PvP", "Ladder", null, tag, opponentTag, ago, trophies, opponentTrophies ?? trophies, clanTag);

    protected static object RankedBattle(string tag, string opponentTag, TimeSpan ago, int league, string? clanTag = null)
        => LadderBattle("pathOfLegend", "Ranked1v1_NewArena2", league, tag, opponentTag, ago, null, null, clanTag);

    private static object LadderBattle(
        string type, string mode, int? league, string tag, string opponentTag, TimeSpan ago,
        int? trophies, int? opponentTrophies, string? clanTag)
    {
        object Cards(int firstId) => Enumerable.Range(firstId, 8).Select(id => new { id, level = 14, maxLevel = 16, rarity = "common" });

        return new
        {
            type,
            battleTime = BattleTime(ago),
            gameMode = new { id = 72000006, name = mode },
            deckSelection = "collection",
            leagueNumber = league,
            team = new[] { new { tag, crowns = 1, startingTrophies = trophies, cards = Cards(1), clan = new { tag = clanTag } } },
            opponent = new[] { new { tag = opponentTag, crowns = 0, startingTrophies = opponentTrophies, cards = Cards(11), clan = new { tag = (string?)null } } },
        };
    }

    public void Dispose()
    {
        _services?.Dispose();
        SqliteConnection.ClearAllPools();
        foreach (var suffix in new[] { "", "-wal", "-shm" })
        {
            File.Delete(_dbPath + suffix);
        }
        _ladder.Dispose();
        GC.SuppressFinalize(this);
    }

    protected sealed class FakeClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    protected sealed class FakeApi : HttpMessageHandler
    {
        public List<string> Ranked { get; } = [];
        public Dictionary<string, List<object>> Logs { get; } = [];
        public HashSet<string> Refused { get; } = [];
        public HashSet<string> Garbled { get; } = [];
        public ConcurrentBag<string> LogsRead { get; } = [];
        public Dictionary<string, List<string>> ClanMembers { get; } = [];
        public ConcurrentBag<string> ClansRead { get; } = [];
        public HashSet<string> BrokenClans { get; } = [];
        public Dictionary<string, DateTimeOffset> LastSeen { get; } = [];

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
                if (Garbled.Contains(tag))
                {
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent("<html>Service unavailable</html>", Encoding.UTF8, "text/html"),
                    });
                }
                body = Logs.GetValueOrDefault(tag) ?? [];
            }
            if (path.Contains("/clans/"))
            {
                var clanTag = path.Split('/')[^1];
                ClansRead.Add(clanTag);
                if (BrokenClans.Contains(clanTag))
                {
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError));
                }
                body = new
                {
                    tag = clanTag,
                    memberList = ClanMembers.GetValueOrDefault(clanTag, []).Select(tag => new
                    {
                        tag,
                        lastSeen = LastSeen.TryGetValue(tag, out var seen) ? seen.UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z" : null,
                    }),
                };
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            });
        }
    }
}
