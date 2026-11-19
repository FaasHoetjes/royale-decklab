using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class LadderBattlesTests
{
    private const string Time = "20261118T225947.000Z";

    private static List<CrBattleCard> Cards(int firstId, int level = 16, int maxLevel = 16)
        => Enumerable.Range(firstId, 8)
            .Select(id => new CrBattleCard(id, null, "common", level, maxLevel))
            .Reverse()
            .ToList();

    private static CrBattleSide Side(string tag, int crowns, int? trophies, List<CrBattleCard>? cards = null)
        => new(tag, null, cards ?? Cards(tag == "#A" ? 1 : 11), crowns, null, StartingTrophies: trophies);

    private static CrBattle Battle(string type, string mode, CrBattleSide team, CrBattleSide opponent, int? league = 1)
        => new(type, Time, new CrGameMode(72000006, mode), "collection", [team], [opponent], LeagueNumber: league);

    [Fact]
    public void A_trophy_road_battle_gives_both_sides_with_their_own_trophies()
    {
        var sides = LadderBattles.From(Battle("PvP", "Ladder", Side("#A", 3, 12530), Side("#B", 1, 12505)));

        Assert.Equal(2, sides.Count);
        var a = sides.Single(s => s.PlayerTag == "#A");
        var b = sides.Single(s => s.PlayerTag == "#B");
        Assert.Equal((LadderMode.TrophyRoad, 12530, BattleResult.Win, "#B"), (a.Mode, a.Standing, a.Result, a.OpponentTag));
        Assert.Equal((12505, BattleResult.Loss), (b.Standing, b.Result));
        Assert.Equal([1, 2, 3, 4, 5, 6, 7, 8], a.Cards.Select(c => c.Id));
        Assert.Equal(a.BattleTimeMs, b.BattleTimeMs);
    }

    [Fact]
    public void A_ranked_battle_is_placed_by_its_league()
    {
        var sides = LadderBattles.From(Battle("pathOfLegend", "Ranked1v1_NewArena2", Side("#A", 1, null), Side("#B", 1, null), league: 4));

        Assert.All(sides, s => Assert.Equal((LadderMode.Ranked, 4, BattleResult.Draw), (s.Mode, s.Standing, s.Result)));
    }

    [Fact]
    public void Levels_are_on_the_unified_scale()
    {
        var epics = Enumerable.Range(1, 8).Select(id => new CrBattleCard(id, null, "epic", 9, 11)).ToList();
        var sides = LadderBattles.From(Battle("PvP", "Ladder", Side("#A", 1, 6000, epics), Side("#B", 0, 6010)));

        Assert.All(sides.Single(s => s.PlayerTag == "#A").Cards, c => Assert.Equal(14, c.Level));
    }

    [Theory]
    [InlineData("trail", "Ladder")]
    [InlineData("PvP", "Showdown_Friendly")]
    [InlineData("riverRacePvP", "CW_Battle_1v1")]
    public void Other_modes_give_nothing(string type, string mode)
        => Assert.Empty(LadderBattles.From(Battle(type, mode, Side("#A", 1, 10000), Side("#B", 0, 10000))));

    [Fact]
    public void A_side_without_trophies_or_levels_drops_the_battle()
    {
        var unleveled = Enumerable.Range(1, 8).Select(id => new CrBattleCard(id, null, "common")).ToList();

        Assert.Empty(LadderBattles.From(Battle("PvP", "Ladder", Side("#A", 1, 10000), Side("#B", 0, null))));
        Assert.Empty(LadderBattles.From(Battle("PvP", "Ladder", Side("#A", 1, 10000, unleveled), Side("#B", 0, 10000))));
    }

    [Fact]
    public void A_2v2_battle_gives_nothing()
    {
        var battle = Battle("PvP", "Ladder", Side("#A", 1, 10000), Side("#B", 0, 10000)) with
        {
            Team = [Side("#A", 1, 10000), Side("#C", 1, 10000)],
        };

        Assert.Empty(LadderBattles.From(battle));
    }
}
