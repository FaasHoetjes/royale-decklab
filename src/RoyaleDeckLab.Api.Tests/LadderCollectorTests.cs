using Microsoft.Extensions.DependencyInjection;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class LadderCollectorTests : CollectorFixture
{
    private static readonly LadderGroup At6000 = new(LadderMode.TrophyRoad, 6000);

    private async Task CollectAsync()
    {
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<LadderCollector>().CollectAsync();
    }

    private LadderSchedule Schedule() => Services.GetRequiredService<LadderSchedule>();

    private void Visit(string tag) => Services.GetRequiredService<VisitorSeeds>().Add(tag);

    private int StoredSides() => Services.GetRequiredService<LadderStore>().Counts().PerTrophyBand.Values.Sum();

    [Fact]
    public async Task A_visitor_brings_in_the_opponents_of_their_trophy_range()
    {
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1), 6100, 6120)];
        Api.Logs["#A"] = [TrophyRoadBattle("#A", "#B", TimeSpan.FromHours(2), 6120, 6200)];
        Api.Logs["#B"] = [TrophyRoadBattle("#B", "#C", TimeSpan.FromHours(3), 6200, 6150)];

        await CollectAsync();

        Assert.Equal(["#A", "#B", "#V"], Api.LogsRead.Order());
        Assert.Equal(3, Schedule().PlayersIn(At6000));
        Assert.Equal(6, StoredSides());
    }

    [Fact]
    public async Task A_full_range_follows_no_more_opponents()
    {
        LadderOptions.MaxPlayersPerGroup = 1;
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1))];

        await CollectAsync();

        Assert.Equal(["#V"], Api.LogsRead);
    }

    [Fact]
    public async Task Players_below_the_lowest_range_are_stored_but_not_followed()
    {
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1), trophies: 3000)];

        await CollectAsync();

        Assert.Equal(["#V"], Api.LogsRead);
        Assert.Equal(2, StoredSides());
        Assert.False(Schedule().IsKnown("#V"));
    }

    [Fact]
    public async Task Ranked_players_are_grouped_by_league()
    {
        Visit("#V");
        Api.Logs["#V"] = [RankedBattle("#V", "#A", TimeSpan.FromHours(1), league: 3)];
        Api.Logs["#A"] = [RankedBattle("#A", "#B", TimeSpan.FromHours(2), league: 3)];

        await CollectAsync();

        Assert.Contains("#A", Api.LogsRead);
        Assert.Equal(2, Schedule().PlayersIn(new LadderGroup(LadderMode.Ranked, 3)));
    }

    [Fact]
    public async Task A_poll_reads_no_more_logs_than_its_budget()
    {
        LadderOptions.ReadsPerPoll = 2;
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1))];
        Api.Logs["#A"] = [TrophyRoadBattle("#A", "#B", TimeSpan.FromHours(2))];

        await CollectAsync();

        Assert.Equal(["#A", "#V"], Api.LogsRead.Order());
    }

    [Fact]
    public async Task Opponents_left_over_by_the_budget_are_read_next_poll()
    {
        LadderOptions.ReadsPerPoll = 2;
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1)), TrophyRoadBattle("#V", "#B", TimeSpan.FromHours(2))];

        await CollectAsync();
        Api.LogsRead.Clear();
        await CollectAsync();

        Assert.Single(Api.LogsRead);
        Assert.Contains(Api.LogsRead.Single(), new[] { "#A", "#B" });
    }

    [Fact]
    public async Task Opponents_are_carried_over_one_poll_only()
    {
        LadderOptions.ReadsPerPoll = 1;
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1)), TrophyRoadBattle("#V", "#B", TimeSpan.FromHours(2))];

        await CollectAsync();
        await CollectAsync();

        Assert.Empty(Schedule().TakeMet());
    }

    [Fact]
    public async Task A_full_range_carries_no_opponents_over()
    {
        LadderOptions.MaxPlayersPerGroup = 1;
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1))];

        await CollectAsync();

        Assert.Empty(Schedule().TakeMet());
    }

    [Fact]
    public async Task A_player_who_drops_below_the_lowest_range_is_dropped()
    {
        RestoreTracked(["#T"]);
        Api.Logs["#T"] = [TrophyRoadBattle("#T", "#X", TimeSpan.FromMinutes(30), trophies: 3900)];

        await CollectAsync();

        Assert.Contains("#T", Api.LogsRead);
        Assert.False(Schedule().IsKnown("#T"));
    }

    [Fact]
    public async Task A_player_who_dropped_below_the_lowest_range_isnt_followed_back_in_from_older_battles()
    {
        RestoreTracked(["#T"]);
        Api.Logs["#T"] = [TrophyRoadBattle("#T", "#X", TimeSpan.FromMinutes(30), trophies: 3900)];
        await CollectAsync();

        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#T", TimeSpan.FromHours(1), trophies: 4100)];
        await CollectAsync();

        Assert.Single(Api.LogsRead, tag => tag == "#T");
    }

    [Fact]
    public async Task A_reread_waits_most_of_the_time_the_log_took_to_fill()
    {
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1)), TrophyRoadBattle("#V", "#B", TimeSpan.FromHours(11))];

        await CollectAsync();

        Assert.False(Schedule().IsDue("#V", Now.AddHours(7.5).ToUnixTimeMilliseconds()));
        Assert.True(Schedule().IsDue("#V", Now.AddHours(8.5).ToUnixTimeMilliseconds()));
    }

    [Fact]
    public async Task A_restart_picks_up_each_players_next_read_where_the_last_poll_left_it()
    {
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1))];
        await CollectAsync();

        var restarted = new LadderSchedule(Microsoft.Extensions.Options.Options.Create(LadderOptions));
        restarted.Load(Services.GetRequiredService<LadderStore>().LoadTracked(), Now.ToUnixTimeMilliseconds());

        Assert.Equal(["#V"], restarted.KnownTags());
        Assert.False(restarted.IsDue("#V", Now.ToUnixTimeMilliseconds()));
    }

    [Fact]
    public async Task A_broken_ladder_db_skips_the_poll()
    {
        BreakLadderStore();
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1))];

        await CollectAsync();

        Assert.Empty(Api.LogsRead);
    }

    [Fact]
    public async Task A_clan_asked_without_reads_left_for_its_members_is_asked_again()
    {
        LadderOptions.ReadsPerPoll = 2;
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromMinutes(30), clanTag: "#CLAN")];
        Api.ClanMembers["#CLAN"] = ["#V", "#MATE"];
        Api.LastSeen["#MATE"] = Now.AddHours(-2);

        await CollectAsync();

        Assert.Equal(["#V"], Api.LogsRead);
        Assert.Equal(["#CLAN"], Api.ClansRead);

        LadderOptions.ReadsPerPoll = 10;
        Clock.Now = Now.AddHours(49);
        await CollectAsync();

        Assert.Contains("#MATE", Api.LogsRead);
    }

    [Fact]
    public async Task The_emptiest_range_gets_the_reads_first()
    {
        LadderOptions.ReadsPerPoll = 3;
        LadderOptions.MaxPlayersPerGroup = 3;
        Visit("#V");
        Api.Logs["#V"] = [
            TrophyRoadBattle("#V", "#FULL", TimeSpan.FromHours(1), 6000, 6000),
            TrophyRoadBattle("#V", "#EMPTY", TimeSpan.FromHours(2), 6000, 8000),
        ];
        RestoreTracked(["#T1"]);

        await CollectAsync();

        Assert.Contains("#EMPTY", Api.LogsRead);
        Assert.DoesNotContain("#FULL", Api.LogsRead);
    }

    [Fact]
    public async Task A_duel_weekend_lowers_the_budget()
    {
        LadderOptions.ReadsPerPollDuringDuels = 1;
        await StoreDuelAsync(TimeSpan.FromMinutes(30));
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1))];

        await CollectAsync();

        Assert.Equal(["#V"], Api.LogsRead);
    }

    [Fact]
    public async Task Rereads_leave_room_for_seeds_and_get_what_the_seeds_leave()
    {
        LadderOptions.ReadsPerPoll = 4;
        LadderOptions.SeedsPerPoll = 2;
        RestoreTracked(["#T1", "#T2", "#T3", "#T4"]);
        Visit("#V");

        await CollectAsync();

        Assert.Contains("#V", Api.LogsRead);
        Assert.Equal(3, Api.LogsRead.Count(tag => tag.StartsWith("#T")));
    }

    [Fact]
    public async Task The_clanmates_of_a_player_in_a_range_with_room_are_tried()
    {
        Visit("#V");
        Api.Logs["#V"] = [TrophyRoadBattle("#V", "#A", TimeSpan.FromHours(1), clanTag: "#CLAN")];
        Api.ClanMembers["#CLAN"] = ["#V", "#MATE"];
        Api.LastSeen["#MATE"] = Now.AddHours(-2);

        await CollectAsync();

        Assert.Contains("#CLAN", Api.ClansRead);
        Assert.Contains("#MATE", Api.LogsRead);
    }

    [Fact]
    public void A_restart_tracks_the_latest_players_of_each_range_again()
    {
        LadderOptions.MaxPlayersPerGroup = 1;
        var store = Services.GetRequiredService<LadderStore>();
        store.Merge([Side("#OLD", TimeSpan.FromHours(5)), Side("#NEW", TimeSpan.FromHours(1)), Side("#LOW", TimeSpan.FromHours(1), 3000)]);

        RestoreTracked([]);

        Assert.Equal(["#NEW"], Schedule().KnownTags());
    }

    [Fact]
    public void A_visitor_waits_in_both_polls()
    {
        Visit("#V");

        Assert.Equal(["#V"], Schedule().TakeVisitors(Now.ToUnixTimeMilliseconds(), 10));
        Assert.Equal(["#V"], Services.GetRequiredService<CrownSeriesSchedule>().TakeVisitors(Now.ToUnixTimeMilliseconds(), 10));
    }

    private void RestoreTracked(IReadOnlyList<string> tags)
    {
        Services.GetRequiredService<LadderStore>().Merge(tags.Select(tag => Side(tag, TimeSpan.FromHours(1))).ToList());
        using var scope = Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<LadderCollector>().RestoreSchedule();
    }

    private static LadderBattle Side(string tag, TimeSpan ago, int trophies = 6000) => new()
    {
        PlayerTag = tag,
        OpponentTag = "#SOMEONE",
        BattleTimeMs = (Now - ago).ToUnixTimeMilliseconds(),
        Mode = LadderMode.TrophyRoad,
        Standing = trophies,
        Result = BattleResult.Win,
        Cards = [new CrownSeriesCard(26000000, 16, CardVersionKind.Normal)],
    };

    private async Task StoreDuelAsync(TimeSpan ago)
    {
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().MergeRoundsAsync([new CrownSeriesRound
        {
            PlayerTag = "#DUELIST",
            OpponentTag = "#OTHER",
            BattleTimeMs = (Now - ago).ToUnixTimeMilliseconds(),
            Round = 0,
            Result = BattleResult.Win,
            Cards = [new CrownSeriesCard(26000000, 16, CardVersionKind.Normal)],
            League = 1,
            EventTag = "#EVENT",
            GameModeId = 72000513,
        }]);
    }
}
