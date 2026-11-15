using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CrownSeriesRoundsTests
{
    private const string Time = "20261115T041808.000Z";

    private static List<CrBattleCard> Cards(int firstId, int level = 14, int maxLevel = 14)
        => Enumerable.Range(firstId, 8)
            .Select(id => new CrBattleCard(id, null, "Rare", level, maxLevel))
            .Reverse()
            .ToList();

    private static CrBattleSide Side(string tag, params CrBattleRound[] rounds)
        => new(tag, null, null, rounds.Sum(r => r.Crowns), rounds.ToList());

    private static CrBattle Duel(CrBattleSide team, CrBattleSide opponent, int? league = 1, string mode = "Competitive_Multideck")
        => new("unknown", Time, new CrGameMode(72000513, mode), "quadDeckPick", [team], [opponent], "#EVENT", league);

    [Fact]
    public void Each_round_gives_both_players_deck_and_result()
    {
        var battle = Duel(
            Side("#A", new CrBattleRound(1, Cards(1)), new CrBattleRound(0, Cards(11)), new CrBattleRound(2, Cards(21))),
            Side("#B", new CrBattleRound(0, Cards(31)), new CrBattleRound(3, Cards(41)), new CrBattleRound(1, Cards(51))));

        var rounds = CrownSeriesRounds.From(battle);

        Assert.Equal(6, rounds.Count);
        var a = rounds.Where(r => r.PlayerTag == "#A").OrderBy(r => r.Round).ToList();
        Assert.Equal([BattleResult.Win, BattleResult.Loss, BattleResult.Win], a.Select(r => r.Result));
        Assert.Equal([11, 12, 13, 14, 15, 16, 17, 18], a[1].CardIds);
        Assert.Equal($"#A|{Time}|r1", a[1].Key);
        var b = rounds.Single(r => r.PlayerTag == "#B" && r.Round == 1);
        Assert.Equal(BattleResult.Win, b.Result);
        Assert.Equal([41, 42, 43, 44, 45, 46, 47, 48], b.CardIds);
        Assert.All(rounds, r => Assert.Equal((1, "#EVENT", 72000513), (r.League, r.EventTag, r.GameModeId)));
    }

    [Fact]
    public void A_duel_read_from_either_players_log_gives_the_same_rows()
    {
        var a = Side("#A", new CrBattleRound(1, Cards(1)), new CrBattleRound(1, Cards(11)));
        var b = Side("#B", new CrBattleRound(0, Cards(31)), new CrBattleRound(0, Cards(41)));

        var fromA = CrownSeriesRounds.From(Duel(a, b));
        var fromB = CrownSeriesRounds.From(Duel(b, a));

        Assert.Equal(fromA.Select(r => (r.Key, r.MatchKey, r.Result)).Order(), fromB.Select(r => (r.Key, r.MatchKey, r.Result)).Order());
        Assert.Single(fromA.Select(r => r.MatchKey).Distinct());
    }

    [Fact]
    public void Levels_are_on_the_unified_scale()
    {
        var epics = Enumerable.Range(1, 8).Select(id => new CrBattleCard(id, null, "Epic", 9, 11)).ToList();
        var battle = Duel(Side("#A", new CrBattleRound(1, epics)), Side("#B", new CrBattleRound(0, Cards(31, 16, 16))));

        var rounds = CrownSeriesRounds.From(battle);

        Assert.All(rounds.Single(r => r.PlayerTag == "#A").CardLevels, c => Assert.Equal(14, c.Level));
        Assert.All(rounds.Single(r => r.PlayerTag == "#B").CardLevels, c => Assert.Equal(16, c.Level));
    }

    [Fact]
    public void Other_modes_and_incomplete_duels_give_no_rounds()
    {
        var a = Side("#A", new CrBattleRound(1, Cards(1)));
        var b = Side("#B", new CrBattleRound(0, Cards(31)));
        var unlevelled = Side("#B", new CrBattleRound(0, [.. Cards(31).Take(7), new CrBattleCard(99, null, "Rare")]));

        Assert.Empty(CrownSeriesRounds.From(Duel(a, b, mode: "CW_Duel_1v1")));
        Assert.Empty(CrownSeriesRounds.From(Duel(a, b, league: null)));
        Assert.Empty(CrownSeriesRounds.From(Duel(a, unlevelled)));
    }

    [Fact]
    public void A_multi_deck_battle_of_another_mode_is_told_apart()
    {
        var a = Side("#A", new CrBattleRound(1, Cards(1)));
        var b = Side("#B", new CrBattleRound(0, Cards(31)));

        Assert.True(CrownSeriesRounds.IsOtherMultiDeckBattle(Duel(a, b, mode: "Competitive_Multideck_Grand")));
        Assert.False(CrownSeriesRounds.IsOtherMultiDeckBattle(Duel(a, b)));
    }
}
