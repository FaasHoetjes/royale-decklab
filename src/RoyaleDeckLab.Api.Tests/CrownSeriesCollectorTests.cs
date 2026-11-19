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

public sealed class CrownSeriesCollectorTests : CollectorFixture
{
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

    private async Task CollectAsync()
    {
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<CrownSeriesCollector>().CollectAsync();
    }

    private List<CrownSeriesRound> Stored()
    {
        using var scope = Services.CreateScope();
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
        using var scope = Services.CreateScope();
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

    private CrownSeriesSchedule Schedule() => Services.GetRequiredService<CrownSeriesSchedule>();

    private long LastPollMs()
    {
        using var scope = Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().GetLastPollMs();
    }

    [Fact]
    public async Task Stores_the_duels_of_ranked_players_and_of_their_opponents()
    {
        Api.Ranked.AddRange(["#R1", "#R2"]);
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        Api.Logs["#OPP"] = [Duel("#OPP", "#R1", TimeSpan.FromHours(1)), Duel("#OPP", "#DEEP", TimeSpan.FromHours(2))];

        await CollectAsync();

        var stored = Stored();
        Assert.Equal(8, stored.Count);
        Assert.Equal(["#DEEP", "#OPP", "#R1"], stored.Select(r => r.PlayerTag).Distinct().Order());
        Assert.Equal(["#OPP", "#R1", "#R2"], Api.LogsRead.Order());
        Assert.Equal(Now.ToUnixTimeMilliseconds(), LastPollMs());
    }

    [Fact]
    public async Task A_poll_saves_the_schedule_for_the_next_start()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12)];

        await CollectAsync();

        using var scope = Services.CreateScope();
        var saved = scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().LoadTracked();
        var r1 = Assert.Single(saved, p => p.Tag == "#R1");
        Assert.Equal(12, r1.Group);
        Assert.True(r1.NextReadMs > Now.ToUnixTimeMilliseconds());
    }

    [Fact]
    public async Task A_log_that_fills_slowly_is_not_read_again_next_hour()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1)), Duel("#R1", "#OPP", TimeSpan.FromHours(30))];
        Api.Logs["#FAST"] = [Duel("#FAST", "#R1", TimeSpan.FromHours(1)), Duel("#FAST", "#R1", TimeSpan.FromHours(2))];
        Api.Logs["#R1"].Add(Duel("#R1", "#FAST", TimeSpan.FromHours(1.5)));

        await CollectAsync();
        Clock.Now = Now.AddHours(1);
        Api.LogsRead.Clear();
        await CollectAsync();

        Assert.Equal(["#FAST"], Api.LogsRead);
    }

    [Fact]
    public async Task Stores_each_round_once_however_often_it_is_polled()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        Api.Logs["#OPP"] = [Duel("#OPP", "#R1", TimeSpan.FromHours(1))];

        await CollectAsync();
        Clock.Now = Now.AddHours(9);
        await CollectAsync();

        Assert.Equal(4, Stored().Count);
    }

    [Fact]
    public async Task Off_a_duel_weekend_only_the_probe_players_are_read()
    {
        Api.Ranked.AddRange(["#R1", "#R2"]);
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromDays(3))];

        await CollectAsync();

        Assert.Equal(["#R1"], Api.LogsRead);
        Assert.Equal(Now.ToUnixTimeMilliseconds(), LastPollMs());
    }

    [Fact]
    public async Task The_probe_reads_the_players_who_played_most_duels()
    {
        Api.Ranked.AddRange(["#R1", "#R2"]);
        Api.Logs["#R1"] = [Duel("#R1", "#ACTIVE", TimeSpan.FromDays(3))];
        Api.Logs["#ACTIVE"] = [Duel("#ACTIVE", "#R2", TimeSpan.FromDays(3.1)), Duel("#ACTIVE", "#R1", TimeSpan.FromDays(3.5))];
        Clock.Now = Now.AddDays(-3).AddHours(1);
        await CollectAsync();
        Clock.Now = Now;
        Api.LogsRead.Clear();

        await CollectAsync();

        Assert.Equal(["#ACTIVE"], Api.LogsRead);
    }

    [Fact]
    public async Task A_refusing_api_stops_the_poll_and_keeps_what_was_read()
    {
        Api.Ranked.AddRange(["#R1", "#R2"]);
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        Api.Refused.Add("#R2");

        await CollectAsync();

        Assert.Equal(4, Stored().Count);
        Assert.DoesNotContain("#OPP", Api.LogsRead);
    }

    [Fact]
    public async Task A_log_that_comes_back_garbled_leaves_the_poll_to_the_others()
    {
        Api.Ranked.AddRange(["#R1", "#R2"]);
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        Api.Garbled.Add("#R2");

        await CollectAsync();

        Assert.Equal(4, Stored().Count);
        Assert.Contains("#OPP", Api.LogsRead);
        Assert.Equal(Now.ToUnixTimeMilliseconds(), LastPollMs());
    }

    [Fact]
    public async Task Rounds_older_than_the_battle_window_are_pruned()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OLD", TimeSpan.FromDays(40)), Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        await CollectAsync();
        Clock.Now = Now.AddHours(9);

        await CollectAsync();

        Assert.DoesNotContain(Stored(), r => r.PlayerTag == "#OLD");
        Assert.Contains(Stored(), r => r.PlayerTag == "#OPP");
    }

    [Fact]
    public async Task War_players_seed_the_lower_leagues_and_bring_in_their_opponents()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#SEED", "#IDLE");
        Api.Logs["#SEED"] = [Duel("#SEED", "#LOW", TimeSpan.FromHours(1), cap: 13)];
        Api.Logs["#LOW"] = [Duel("#LOW", "#SEED", TimeSpan.FromHours(1), cap: 13)];

        await CollectAsync();

        Assert.Contains("#LOW", Api.LogsRead);
        Assert.Contains(Stored(), r => r.PlayerTag == "#LOW");
        Assert.Equal(2, Schedule().PlayersIn(13));
        Assert.False(Schedule().IsKnown("#IDLE"));
    }

    [Fact]
    public async Task A_seed_tried_this_weekend_is_not_read_again()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#IDLE");

        await CollectAsync();
        Assert.Contains("#IDLE", Api.LogsRead);
        Clock.Now = Now.AddHours(1);
        Api.LogsRead.Clear();
        await CollectAsync();

        Assert.DoesNotContain("#IDLE", Api.LogsRead);
    }

    [Fact]
    public async Task A_seed_whose_log_couldnt_be_read_is_tried_again_next_poll()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#FLAKY");
        Api.Garbled.Add("#FLAKY");

        await CollectAsync();
        Api.Garbled.Clear();
        Clock.Now = Now.AddHours(1);
        Api.LogsRead.Clear();
        await CollectAsync();

        Assert.Contains("#FLAKY", Api.LogsRead);
    }

    [Fact]
    public async Task A_seed_who_battled_lately_without_a_duel_is_tried_again_within_the_weekend()
    {
        CrownSeries.LiveDuelWindowMs = (long)TimeSpan.FromDays(1).TotalMilliseconds;
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#LATE");
        Api.Logs["#LATE"] = [TrophyRoadBattle("#LATE", "#SOMEONE", TimeSpan.FromHours(1))];

        await CollectAsync();
        Clock.Now = Now.AddHours(1);
        Api.LogsRead.Clear();
        await CollectAsync();
        var readAfterAnHour = Api.LogsRead.Contains("#LATE");
        Clock.Now = Now.AddHours(12);
        Api.LogsRead.Clear();
        await CollectAsync();

        Assert.False(readAfterAnHour);
        Assert.Contains("#LATE", Api.LogsRead);
    }

    [Fact]
    public async Task A_visitor_of_the_page_is_read_and_brings_in_their_league()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        Api.Logs["#VISITOR"] = [Duel("#VISITOR", "#LOW", TimeSpan.FromHours(1), cap: 11)];
        Api.Logs["#LOW"] = [Duel("#LOW", "#VISITOR", TimeSpan.FromHours(1), cap: 11)];
        Schedule().AddVisitor("#VISITOR", Now.ToUnixTimeMilliseconds());

        await CollectAsync();

        Assert.Contains("#LOW", Api.LogsRead);
        Assert.Equal(2, Schedule().PlayersIn(11));
    }

    [Fact]
    public async Task The_clanmates_and_ladder_opponents_of_a_lower_league_player_are_tried()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN"), TrophyRoadBattle("#R1", "#LADDER", TimeSpan.FromHours(2))];
        Api.ClanMembers["#CLAN"] = ["#R1", "#MATE"];

        await CollectAsync();

        Assert.Contains("#MATE", Api.LogsRead);
        Assert.Contains("#LADDER", Api.LogsRead);
    }

    [Fact]
    public async Task A_visitor_who_hasnt_played_yet_is_read_again_until_their_duels_show()
    {
        CrownSeries.VisitorRereadMs = CrownSeries.PollIntervalMs;
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        Schedule().AddVisitor("#VISITOR", Now.ToUnixTimeMilliseconds());
        await CollectAsync();

        Clock.Now = Now.AddHours(1);
        Api.Logs["#VISITOR"] = [Duel("#VISITOR", "#LOW", TimeSpan.Zero, cap: 12)];
        await CollectAsync();

        Assert.Equal(12, Schedule().GroupOf("#VISITOR"));
    }

    [Fact]
    public async Task A_clan_whose_members_found_no_room_is_asked_again_next_poll()
    {
        CrownSeries.SeedsPerPoll = 1;
        CrownSeries.MaxRereadIntervalMs = CrownSeries.PollIntervalMs;
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN")];
        Api.ClanMembers["#CLAN"] = ["#MATE1", "#MATE2"];

        await CollectAsync();
        Clock.Now = Now.AddHours(1);
        await CollectAsync();

        Assert.Contains("#MATE1", Api.LogsRead);
        Assert.Contains("#MATE2", Api.LogsRead);
    }

    [Fact]
    public async Task A_clan_that_couldnt_be_read_is_asked_again_next_poll()
    {
        CrownSeries.MaxRereadIntervalMs = CrownSeries.PollIntervalMs;
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN")];
        Api.ClanMembers["#CLAN"] = ["#MATE"];
        Api.BrokenClans.Add("#CLAN");

        await CollectAsync();
        Api.BrokenClans.Clear();
        Clock.Now = Now.AddHours(1);
        await CollectAsync();

        Assert.Equal(2, Api.ClansRead.Count);
        Assert.Contains("#MATE", Api.LogsRead);
    }

    [Fact]
    public async Task A_clan_whose_members_all_fit_is_not_asked_again_next_poll()
    {
        CrownSeries.MaxRereadIntervalMs = CrownSeries.PollIntervalMs;
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN")];
        Api.ClanMembers["#CLAN"] = ["#MATE"];

        await CollectAsync();
        Clock.Now = Now.AddHours(1);
        await CollectAsync();

        Assert.Single(Api.ClansRead);
    }

    [Fact]
    public async Task Clanmates_not_seen_online_lately_are_not_tried()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), cap: 12, clanTag: "#CLAN")];
        Api.ClanMembers["#CLAN"] = ["#ONLINE", "#AWAY"];
        Api.LastSeen["#ONLINE"] = Now.AddHours(-2);
        Api.LastSeen["#AWAY"] = Now.AddDays(-10);

        await CollectAsync();

        Assert.Contains("#ONLINE", Api.LogsRead);
        Assert.DoesNotContain("#AWAY", Api.LogsRead);
    }

    [Fact]
    public async Task Lower_league_opponents_are_followed_several_steps_in_one_poll()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#A", TimeSpan.FromHours(1), cap: 12)];
        Api.Logs["#A"] = [Duel("#A", "#B", TimeSpan.FromHours(1), cap: 12)];
        Api.Logs["#B"] = [Duel("#B", "#C", TimeSpan.FromHours(1), cap: 12)];
        Api.Logs["#C"] = [Duel("#C", "#D", TimeSpan.FromHours(1), cap: 12)];

        await CollectAsync();

        Assert.Contains("#D", Api.LogsRead);
        Assert.Equal(4, Schedule().PlayersIn(12));
    }

    [Fact]
    public async Task An_opponent_whose_log_couldnt_be_read_is_not_asked_again_in_the_same_poll()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#A", TimeSpan.FromHours(1), cap: 12)];
        Api.Garbled.Add("#A");

        await CollectAsync();

        Assert.Single(Api.LogsRead, tag => tag == "#A");
    }

    [Fact]
    public async Task A_seed_whose_log_fails_twice_waits_before_it_is_tried_again()
    {
        CrownSeries.LiveDuelWindowMs = (long)TimeSpan.FromDays(1).TotalMilliseconds;
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1))];
        StoreWarPlayers("#GONE");
        Api.Garbled.Add("#GONE");

        foreach (var hours in new[] { 0, 1, 2 })
        {
            Clock.Now = Now.AddHours(hours);
            await CollectAsync();
        }
        var readsBeforeTheWait = Api.LogsRead.Count(tag => tag == "#GONE");
        Clock.Now = Now.AddHours(13);
        await CollectAsync();

        Assert.Equal(2, readsBeforeTheWait);
        Assert.Equal(3, Api.LogsRead.Count(tag => tag == "#GONE"));
    }

    [Fact]
    public async Task Kings_league_opponents_are_followed_once_per_poll()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#A", TimeSpan.FromHours(1))];
        Api.Logs["#A"] = [Duel("#A", "#B", TimeSpan.FromHours(1))];

        await CollectAsync();

        Assert.Contains("#A", Api.LogsRead);
        Assert.DoesNotContain("#B", Api.LogsRead);
    }

    [Fact]
    public async Task A_poll_that_adds_or_prunes_nothing_reports_no_change()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromDays(3))];

        using var scope = Services.CreateScope();
        var collector = scope.ServiceProvider.GetRequiredService<CrownSeriesCollector>();
        var first = await collector.CollectAsync();
        var second = await collector.CollectAsync();

        Assert.True(first);
        Assert.False(second);
    }

    [Fact]
    public async Task A_kings_league_player_brings_in_no_clanmates_or_ladder_opponents()
    {
        Api.Ranked.Add("#R1");
        Api.Logs["#R1"] = [Duel("#R1", "#OPP", TimeSpan.FromHours(1), clanTag: "#CLAN"), TrophyRoadBattle("#R1", "#LADDER", TimeSpan.FromHours(2))];

        await CollectAsync();

        Assert.Empty(Api.ClansRead);
        Assert.DoesNotContain("#LADDER", Api.LogsRead);
    }
}
