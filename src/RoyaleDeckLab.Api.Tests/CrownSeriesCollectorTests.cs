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
    private readonly CrownSeriesOptions _options = new() { ProbePlayers = 1 };
    private readonly ServiceProvider _services;

    public CrownSeriesCollectorTests()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(_options));
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddScoped<CrownSeriesRepository>();
        services.AddScoped<BattleRepository>();
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

    // Rare cards top out at 14, which shows as 16.
    private static object Duel(string tag, string opponentTag, TimeSpan ago, int cap = 16, string? clanTag = null)
    {
        object Round(int crowns, int firstId) => new
        {
            crowns,
            cards = Enumerable.Range(firstId, 8).Select(id => new { id, level = cap - 2, maxLevel = 14, rarity = "Rare" }),
        };

        return new
        {
            type = "unknown",
            battleTime = (Now - ago).UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z",
            gameMode = new { id = 72000513, name = "Competitive_Multideck" },
            deckSelection = "quadDeckPick",
            eventTag = "#EVENT",
            leagueNumber = 1,
            team = new[] { new { tag, crowns = 2, rounds = new[] { Round(1, 1), Round(1, 11) }, clan = new { tag = clanTag } } },
            opponent = new[] { new { tag = opponentTag, crowns = 0, rounds = new[] { Round(0, 21), Round(0, 31) } } },
        };
    }

    private static object Ladder(string tag, string opponentTag, TimeSpan ago) => new
    {
        type = "PvP",
        battleTime = (Now - ago).UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z",
        gameMode = new { id = 72000006, name = "Ladder" },
        deckSelection = "collection",
        team = new[] { new { tag, crowns = 1 } },
        opponent = new[] { new { tag = opponentTag, crowns = 0 } },
    };

    private async Task CollectAsync()
    {
        using var scope = _services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<CrownSeriesCollector>().CollectAsync();
    }

    private List<CrownSeriesRound> Stored()
    {
        using var scope = _services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<MetaDbContext>().CrownSeriesRounds
            .AsNoTracking()
            .AsEnumerable()
            .Select(r => new CrownSeriesRound
            {
                PlayerTag = r.PlayerTag,
                OpponentTag = r.OpponentTag,
                BattleTimeMs = r.BattleTimeMs,
                Round = r.Round,
                Result = r.Result,
                Cards = r.Cards,
                League = r.League,
                EventTag = r.EventTag,
                GameModeId = r.GameModeId,
            })
            .ToList();
    }

    private void StoreWarPlayers(params string[] tags)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
        db.Battles.AddRange(tags.Select(tag => new BattleEntity
        {
            Key = tag,
            BattleTime = "20261110T120000.000Z",
            BattleTimeMs = Now.AddDays(-5).ToUnixTimeMilliseconds(),
            PlayerTag = tag,
            CardIds = [.. Enumerable.Range(1, 8)],
            Result = BattleResult.Win,
        }));
        db.SaveChanges();
    }

    private CrownSeriesSchedule Schedule() => _services.GetRequiredService<CrownSeriesSchedule>();

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
    public async Task A_log_that_comes_back_garbled_leaves_the_poll_to_the_others()
    {
        _api.Ranked.AddRange(["#R1", "#R2"]);
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        _api.Garbled.Add("#R2");

        await CollectAsync();

        Assert.Equal(4, Stored().Count);
        Assert.Contains("#OPP", _api.LogsRead);
        Assert.Equal(Now.ToUnixTimeMilliseconds(), LastPollMs());
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

    [Fact]
    public async Task War_players_seed_the_lower_leagues_and_bring_in_their_opponents()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#SEED", "#IDLE");
        _api.Logs["#SEED"] = [Duel("#SEED", "#LOW", TimeSpan.FromHours(1), cap: 13)];
        _api.Logs["#LOW"] = [Duel("#LOW", "#SEED", TimeSpan.FromHours(1), cap: 13)];

        await CollectAsync();

        Assert.Contains("#LOW", _api.LogsRead);
        Assert.Contains(Stored(), r => r.PlayerTag == "#LOW");
        Assert.Equal(2, Schedule().PlayersAt(13));
        Assert.False(Schedule().IsKnown("#IDLE"));
    }

    [Fact]
    public async Task A_seed_tried_this_weekend_is_not_read_again()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#IDLE");

        await CollectAsync();
        Assert.Contains("#IDLE", _api.LogsRead);
        _clock.Now = Now.AddHours(1);
        _api.LogsRead.Clear();
        await CollectAsync();

        Assert.DoesNotContain("#IDLE", _api.LogsRead);
    }

    [Fact]
    public async Task A_seed_whose_log_couldnt_be_read_is_tried_again_next_poll()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#FLAKY");
        _api.Garbled.Add("#FLAKY");

        await CollectAsync();
        _api.Garbled.Clear();
        _clock.Now = Now.AddHours(1);
        _api.LogsRead.Clear();
        await CollectAsync();

        Assert.Contains("#FLAKY", _api.LogsRead);
    }

    [Fact]
    public async Task A_seed_who_battled_lately_without_a_duel_is_tried_again_within_the_weekend()
    {
        _options.LiveDuelWindowMs = (long)TimeSpan.FromDays(1).TotalMilliseconds;
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#LATE");
        _api.Logs["#LATE"] = [Ladder("#LATE", "#SOMEONE", TimeSpan.FromHours(1))];

        await CollectAsync();
        _clock.Now = Now.AddHours(1);
        _api.LogsRead.Clear();
        await CollectAsync();
        var readAfterAnHour = _api.LogsRead.Contains("#LATE");
        _clock.Now = Now.AddHours(12);
        _api.LogsRead.Clear();
        await CollectAsync();

        Assert.False(readAfterAnHour);
        Assert.Contains("#LATE", _api.LogsRead);
    }

    [Fact]
    public async Task A_visitor_of_the_page_is_read_and_brings_in_their_league()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        _api.Logs["#VISITOR"] = [Duel("#VISITOR", "#LOW", TimeSpan.FromHours(1), cap: 11)];
        _api.Logs["#LOW"] = [Duel("#LOW", "#VISITOR", TimeSpan.FromHours(1), cap: 11)];
        Schedule().AddVisitor("#VISITOR", Now.ToUnixTimeMilliseconds());

        await CollectAsync();

        Assert.Contains("#LOW", _api.LogsRead);
        Assert.Equal(2, Schedule().PlayersAt(11));
    }

    [Fact]
    public async Task The_clanmates_and_ladder_opponents_of_a_lower_league_player_are_tried()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN"), Ladder("#R1", "#LADDER", TimeSpan.FromHours(2))];
        _api.ClanMembers["#CLAN"] = ["#R1", "#MATE"];

        await CollectAsync();

        Assert.Contains("#MATE", _api.LogsRead);
        Assert.Contains("#LADDER", _api.LogsRead);
    }

    [Fact]
    public async Task A_visitor_who_hasnt_played_yet_is_read_again_until_their_duels_show()
    {
        _options.VisitorRereadMs = _options.PollIntervalMs;
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        Schedule().AddVisitor("#VISITOR", Now.ToUnixTimeMilliseconds());
        await CollectAsync();

        _clock.Now = Now.AddHours(1);
        _api.Logs["#VISITOR"] = [Duel("#VISITOR", "#LOW", TimeSpan.Zero, cap: 12)];
        await CollectAsync();

        Assert.Equal(12, Schedule().CapOf("#VISITOR"));
    }

    [Fact]
    public async Task A_clan_whose_members_found_no_room_is_asked_again_next_poll()
    {
        _options.SeedsPerPoll = 1;
        _options.MaxRereadIntervalMs = _options.PollIntervalMs;
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN")];
        _api.ClanMembers["#CLAN"] = ["#MATE1", "#MATE2"];

        await CollectAsync();
        _clock.Now = Now.AddHours(1);
        await CollectAsync();

        Assert.Contains("#MATE1", _api.LogsRead);
        Assert.Contains("#MATE2", _api.LogsRead);
    }

    [Fact]
    public async Task A_clan_that_couldnt_be_read_is_asked_again_next_poll()
    {
        _options.MaxRereadIntervalMs = _options.PollIntervalMs;
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN")];
        _api.ClanMembers["#CLAN"] = ["#MATE"];
        _api.BrokenClans.Add("#CLAN");

        await CollectAsync();
        _api.BrokenClans.Clear();
        _clock.Now = Now.AddHours(1);
        await CollectAsync();

        Assert.Equal(2, _api.ClansRead.Count);
        Assert.Contains("#MATE", _api.LogsRead);
    }

    [Fact]
    public async Task A_clan_whose_members_all_fit_is_not_asked_again_next_poll()
    {
        _options.MaxRereadIntervalMs = _options.PollIntervalMs;
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN")];
        _api.ClanMembers["#CLAN"] = ["#MATE"];

        await CollectAsync();
        _clock.Now = Now.AddHours(1);
        await CollectAsync();

        Assert.Single(_api.ClansRead);
    }

    [Fact]
    public async Task Clanmates_not_seen_online_lately_are_not_tried()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN")];
        _api.ClanMembers["#CLAN"] = ["#ONLINE", "#AWAY"];
        _api.LastSeen["#ONLINE"] = Now.AddHours(-2);
        _api.LastSeen["#AWAY"] = Now.AddDays(-10);

        await CollectAsync();

        Assert.Contains("#ONLINE", _api.LogsRead);
        Assert.DoesNotContain("#AWAY", _api.LogsRead);
    }

    [Fact]
    public async Task Lower_league_opponents_are_followed_several_steps_in_one_poll()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#A", TimeSpan.FromHours(1), cap: 12)];
        _api.Logs["#A"] = [Duel("#A", "#B", TimeSpan.FromHours(1), cap: 12)];
        _api.Logs["#B"] = [Duel("#B", "#C", TimeSpan.FromHours(1), cap: 12)];
        _api.Logs["#C"] = [Duel("#C", "#D", TimeSpan.FromHours(1), cap: 12)];

        await CollectAsync();

        Assert.Contains("#D", _api.LogsRead);
        Assert.Equal(4, Schedule().PlayersAt(12));
    }

    [Fact]
    public async Task An_opponent_whose_log_couldnt_be_read_is_not_asked_again_in_the_same_poll()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#A", TimeSpan.FromHours(1), cap: 12)];
        _api.Garbled.Add("#A");

        await CollectAsync();

        Assert.Single(_api.LogsRead, tag => tag == "#A");
    }

    [Fact]
    public async Task A_seed_whose_log_fails_twice_waits_before_it_is_tried_again()
    {
        _options.LiveDuelWindowMs = (long)TimeSpan.FromDays(1).TotalMilliseconds;
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#GONE");
        _api.Garbled.Add("#GONE");

        foreach (var hours in new[] { 0, 1, 2 })
        {
            _clock.Now = Now.AddHours(hours);
            await CollectAsync();
        }
        var readsBeforeTheWait = _api.LogsRead.Count(tag => tag == "#GONE");
        _clock.Now = Now.AddHours(13);
        await CollectAsync();

        Assert.Equal(2, readsBeforeTheWait);
        Assert.Equal(3, _api.LogsRead.Count(tag => tag == "#GONE"));
    }

    [Fact]
    public async Task Kings_league_opponents_are_followed_once_per_poll()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#A", TimeSpan.FromHours(1))];
        _api.Logs["#A"] = [Duel("#A", "#B", TimeSpan.FromHours(1))];

        await CollectAsync();

        Assert.Contains("#A", _api.LogsRead);
        Assert.DoesNotContain("#B", _api.LogsRead);
    }

    [Fact]
    public async Task A_poll_that_adds_or_prunes_nothing_reports_no_change()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromDays(3))];

        using var scope = _services.CreateScope();
        var collector = scope.ServiceProvider.GetRequiredService<CrownSeriesCollector>();
        var first = await collector.CollectAsync();
        var second = await collector.CollectAsync();

        Assert.True(first);
        Assert.False(second);
    }

    [Fact]
    public async Task A_kings_league_player_brings_in_no_clanmates_or_ladder_opponents()
    {
        _api.Ranked.Add("#R1");
        _api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), clanTag: "#CLAN"), Ladder("#R1", "#LADDER", TimeSpan.FromHours(2))];

        await CollectAsync();

        Assert.Empty(_api.ClansRead);
        Assert.DoesNotContain("#LADDER", _api.LogsRead);
    }
}
