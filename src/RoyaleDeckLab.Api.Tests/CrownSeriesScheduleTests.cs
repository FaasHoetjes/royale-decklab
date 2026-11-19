using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CrownSeriesScheduleTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 12, 0, 0, TimeSpan.Zero);
    private static readonly long NowMs = Now.ToUnixTimeMilliseconds();

    private static CrownSeriesSchedule Schedule(CrownSeriesOptions? options = null)
        => new(Microsoft.Extensions.Options.Options.Create(options ?? new CrownSeriesOptions()));

    private static CrBattle Battle(TimeSpan ago, string mode = "Competitive_Multideck")
        => new("unknown", (Now - ago).UtcDateTime.ToString("yyyyMMdd'T'HHmmss") + ".000Z",
            new CrGameMode(72000513, mode), "quadDeckPick", [], []);

    [Fact]
    public void A_log_that_filled_in_two_hours_is_due_again_next_poll()
    {
        var schedule = Schedule();
        schedule.RecordRead("#A", [Battle(TimeSpan.Zero), Battle(TimeSpan.FromHours(2))], NowMs);

        Assert.True(schedule.IsDue("#A", NowMs + (long)TimeSpan.FromHours(1).TotalMilliseconds));
        Assert.True(schedule.IsDue("#NEW", NowMs));
    }

    [Fact]
    public void A_log_that_filled_in_days_waits_for_the_reread_cap()
    {
        var schedule = Schedule();
        schedule.RecordRead("#A", [Battle(TimeSpan.Zero), Battle(TimeSpan.FromDays(3))], NowMs);

        Assert.False(schedule.IsDue("#A", NowMs + (long)TimeSpan.FromHours(6).TotalMilliseconds));
        Assert.True(schedule.IsDue("#A", NowMs + (long)TimeSpan.FromHours(8).TotalMilliseconds));
    }

    [Fact]
    public void A_poll_interval_above_the_reread_cap_still_schedules_reads()
    {
        var schedule = Schedule(new CrownSeriesOptions
        {
            PollIntervalMs = (long)TimeSpan.FromHours(12).TotalMilliseconds,
            MaxRereadIntervalMs = (long)TimeSpan.FromHours(8).TotalMilliseconds,
        });

        schedule.RecordRead("#A", [], NowMs);

        Assert.False(schedule.IsDue("#A", NowMs));
    }

    [Fact]
    public void Players_who_left_the_ranked_list_and_stopped_playing_duels_are_forgotten()
    {
        var schedule = Schedule();
        var longAgo = Battle(TimeSpan.FromDays(22));
        schedule.RecordRead("#GONE", [longAgo], NowMs);
        schedule.RecordRead("#RANKED", [longAgo], NowMs);
        schedule.RecordRead("#PLAYING", [Battle(TimeSpan.FromDays(2))], NowMs);
        schedule.RecordRead("#LADDER_ONLY", [Battle(TimeSpan.FromHours(1), mode: "Ladder")], NowMs);

        schedule.ForgetInactive(["#RANKED"], NowMs);

        Assert.Equal(["#PLAYING", "#RANKED"], schedule.KnownTags().Order());
    }

    private static CrBattle Duel(TimeSpan ago, int cap)
    {
        static CrBattleRound Round(int crowns, int firstId, int level)
            => new(crowns, [.. Enumerable.Range(firstId, 8).Select(id => new CrBattleCard(id, null, "Rare", level, 14))]);

        return Battle(ago) with
        {
            EventTag = "#EVENT",
            LeagueNumber = 1,
            Team = [new CrBattleSide("#A", null, null, 1, [Round(1, 1, cap - 2)])],
            Opponent = [new CrBattleSide("#B", null, null, 0, [Round(0, 11, cap - 2)])],
        };
    }

    [Fact]
    public void Each_cap_keeps_its_share_and_drops_its_longest_idle_players_first()
    {
        var schedule = Schedule(new CrownSeriesOptions { MaxPlayersPerGroup = 2 });
        schedule.RecordRead("#OLD", [Duel(TimeSpan.FromHours(5), cap: 13)], NowMs);
        schedule.RecordRead("#MID", [Duel(TimeSpan.FromHours(3), cap: 13)], NowMs);
        schedule.RecordRead("#NEW", [Duel(TimeSpan.FromHours(1), cap: 13)], NowMs);
        schedule.RecordRead("#RANKED", [Duel(TimeSpan.FromHours(9), cap: 16)], NowMs);
        schedule.RecordRead("#NODUEL", [Battle(TimeSpan.FromHours(1), "Ladder")], NowMs);

        Assert.Equal(0, schedule.RoomIn(13));
        schedule.Trim(["#RANKED"]);

        Assert.False(schedule.IsKnown("#OLD"));
        Assert.True(schedule.IsKnown("#MID"));
        Assert.True(schedule.IsKnown("#NEW"));
        Assert.True(schedule.IsKnown("#RANKED"));
        Assert.False(schedule.IsKnown("#NODUEL"));
        Assert.Equal(1, schedule.RoomIn(16));
    }

    [Fact]
    public void A_player_counts_toward_the_cap_of_their_latest_duel()
    {
        var schedule = Schedule();
        schedule.RecordRead("#A", [Duel(TimeSpan.FromDays(7), cap: 13), Duel(TimeSpan.FromHours(1), cap: 14)], NowMs);

        Assert.Equal(0, schedule.PlayersIn(13));
        Assert.Equal(1, schedule.PlayersIn(14));
    }

    private static CappedBattle StoredRound(string tag, TimeSpan ago, int cap)
        => new(new BattleRecord
        {
            Key = $"{tag}|{ago}",
            BattleTime = "",
            BattleTimeMs = NowMs - (long)ago.TotalMilliseconds,
            PlayerTag = tag,
            CardIds = [],
            Result = BattleResult.Win,
            CardVersions = [],
        }, cap);

    [Fact]
    public void A_restart_tracks_the_stored_players_again_at_their_latest_cap_and_all_due()
    {
        var schedule = Schedule(new CrownSeriesOptions { MaxPlayersPerGroup = 2 });

        schedule.Restore(
        [
            StoredRound("#MOVED", TimeSpan.FromDays(8), cap: 12),
            StoredRound("#MOVED", TimeSpan.FromHours(1), cap: 13),
            StoredRound("#OLD", TimeSpan.FromHours(5), cap: 13),
            StoredRound("#NEW", TimeSpan.FromHours(2), cap: 13),
            StoredRound("#GONE", TimeSpan.FromDays(22), cap: 11),
        ], NowMs);

        Assert.Equal(["#MOVED", "#NEW"], schedule.KnownTags().Order());
        Assert.Equal(0, schedule.PlayersIn(12));
        Assert.True(schedule.IsDue("#MOVED", NowMs));
    }

    [Fact]
    public void A_visitor_waits_until_a_duel_shows_their_league_or_the_wait_runs_out()
    {
        var schedule = Schedule();
        var weekAgo = NowMs - (long)TimeSpan.FromDays(7).TotalMilliseconds;
        var monthAgo = NowMs - (long)TimeSpan.FromDays(30).TotalMilliseconds;
        schedule.AddVisitor("#PLAYED", NowMs);
        schedule.AddVisitor("#NOT_YET", weekAgo);
        schedule.AddVisitor("#LAPSED", monthAgo);
        schedule.RecordRead("#PLAYED", [Duel(TimeSpan.FromHours(1), cap: 13)], NowMs);
        schedule.RecordRead("#NOT_YET", [Battle(TimeSpan.FromHours(1), "Ladder")], NowMs);

        Assert.Equal(["#NOT_YET"], schedule.TakeVisitors(NowMs, 10));
    }

    [Fact]
    public void A_visitor_tried_without_a_duel_waits_out_the_reread_interval_and_the_poll_takes_only_its_share()
    {
        var schedule = Schedule(new CrownSeriesOptions { VisitorRereadMs = (long)TimeSpan.FromHours(4).TotalMilliseconds });
        schedule.AddVisitor("#A", NowMs);
        schedule.AddVisitor("#B", NowMs);

        var first = schedule.TakeVisitors(NowMs, 1);
        var second = schedule.TakeVisitors(NowMs + (long)TimeSpan.FromHours(1).TotalMilliseconds, 10);
        var third = schedule.TakeVisitors(NowMs + (long)TimeSpan.FromHours(5).TotalMilliseconds, 10);

        Assert.Single(first);
        Assert.Equal(["#A", "#B"], first.Concat(second).Order());
        Assert.Equal(first, third.Take(1));
    }

    [Fact]
    public void A_log_with_no_new_battle_waits_twice_as_long_each_read()
    {
        var schedule = Schedule();
        var log = new[] { Battle(TimeSpan.Zero), Battle(TimeSpan.FromHours(2)) };
        long At(double hours) => NowMs + (long)TimeSpan.FromHours(hours).TotalMilliseconds;

        schedule.RecordRead("#A", log, At(0));
        schedule.RecordRead("#A", log, At(1));
        var dueAfterSecond = (schedule.IsDue("#A", At(2)), schedule.IsDue("#A", At(3)));
        schedule.RecordRead("#A", log, At(3));

        Assert.Equal((false, true), dueAfterSecond);
        Assert.False(schedule.IsDue("#A", At(6)));
        Assert.True(schedule.IsDue("#A", At(7)));
    }

    [Fact]
    public void A_visitor_whose_league_showed_is_not_read_again_after_being_dropped_from_tracking()
    {
        var schedule = Schedule(new CrownSeriesOptions { MaxPlayersPerGroup = 1 });
        schedule.AddVisitor("#VISITOR", NowMs);
        schedule.RecordRead("#KEPT", [Duel(TimeSpan.Zero, cap: 16)], NowMs);
        schedule.RecordRead("#VISITOR", [Duel(TimeSpan.FromHours(1), cap: 16)], NowMs);

        schedule.Trim([]);

        Assert.False(schedule.IsKnown("#VISITOR"));
        Assert.Empty(schedule.TakeVisitors(NowMs, 10));
    }

    [Fact]
    public void A_full_visitor_list_makes_room_by_dropping_the_longest_waiting()
    {
        var schedule = Schedule();
        schedule.AddVisitor("#OLDEST", NowMs - 1);
        foreach (var i in Enumerable.Range(0, 9_999))
        {
            schedule.AddVisitor($"#V{i}", NowMs);
        }

        schedule.AddVisitor("#NEWEST", NowMs);

        var waiting = schedule.TakeVisitors(NowMs, 20_000);
        Assert.Contains("#NEWEST", waiting);
        Assert.DoesNotContain("#OLDEST", waiting);
    }

    [Fact]
    public void A_visitor_looking_themselves_up_again_still_waits_from_their_first_lookup()
    {
        var schedule = Schedule();
        var visitedMs = NowMs - (long)TimeSpan.FromDays(13).TotalMilliseconds;
        schedule.AddVisitor("#REGULAR", visitedMs);
        schedule.AddVisitor("#REGULAR", NowMs);

        Assert.Empty(schedule.TakeVisitors(NowMs + (long)TimeSpan.FromDays(2).TotalMilliseconds, 10));
    }

    [Fact]
    public void A_seed_who_battled_lately_is_tried_again_sooner_than_an_idle_one()
    {
        var schedule = Schedule();
        long At(double hours) => NowMs + (long)TimeSpan.FromHours(hours).TotalMilliseconds;
        schedule.RecordSeedTried("#ACTIVE", At(-3), NowMs);
        schedule.RecordSeedTried("#IDLE", At(-24 * 10), NowMs);

        Assert.False(schedule.IsSeedDue("#ACTIVE", At(6)));
        Assert.True(schedule.IsSeedDue("#ACTIVE", At(12)));
        Assert.False(schedule.IsSeedDue("#IDLE", At(12)));
        Assert.True(schedule.IsSeedDue("#IDLE", At(24 * 5)));
    }
}
