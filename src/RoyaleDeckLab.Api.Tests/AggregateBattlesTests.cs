using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class AggregateBattlesTests
{
    // AggregateBattles is pure CPU (no client/logger use), so a null client is safe
    // for this unit under test.
    private static MetaBuilder NewBuilder()
        => new(null!, Microsoft.Extensions.Options.Options.Create(new MetaOptions()), NullLogger<MetaBuilder>.Instance);

    private static double Cautious(double wins, double games)
    {
        var o = new MetaOptions();
        return DomainMath.PosteriorQuantile(wins, games, o.PriorGames, o.PriorWinRate, o.RankingQuantile);
    }

    [Fact]
    public void CountsWinsLossesAndDraws_WithDrawAsHalfAWin()
    {
        var deck = Build.Eight(1);
        var battles = new[]
        {
            Build.Battle("#P1", deck, BattleResult.Win),
            Build.Battle("#P2", deck, BattleResult.Loss),
            Build.Battle("#P3", deck, BattleResult.Draw),
        };

        var result = Assert.Single(NewBuilder().AggregateBattles(battles));

        Assert.Equal(3, result.Uses);
        Assert.Equal(3, result.Players);
        Assert.Equal(0.5, result.WinRate, 10);
        Assert.Equal(1.0, result.PickRate!.Value, 10);
    }

    [Fact]
    public void DrawContributesHalfAWin_ToTheRate()
    {
        var deck = Build.Eight(1);
        var battles = new[]
        {
            Build.Battle("#P1", deck, BattleResult.Win),
            Build.Battle("#P2", deck, BattleResult.Draw),
        };

        var result = Assert.Single(NewBuilder().AggregateBattles(battles));
        Assert.Equal(0.75, result.WinRate, 10);
    }

    [Fact]
    public void DropsSingleGameNoise()
    {
        // A deck seen in only one battle is below the 2-game floor and is discarded.
        var battles = new[] { Build.Battle("#P1", Build.Eight(1), BattleResult.Win) };
        Assert.Empty(NewBuilder().AggregateBattles(battles));
    }

    [Fact]
    public void ConfidenceIsTheCautiousWinRate_OnEffectiveWins()
    {
        var deck = Build.Eight(1);
        var battles = new[]
        {
            Build.Battle("#P1", deck, BattleResult.Win),
            Build.Battle("#P2", deck, BattleResult.Win),
            Build.Battle("#P3", deck, BattleResult.Loss),
        };

        var result = Assert.Single(NewBuilder().AggregateBattles(battles));
        Assert.Equal(Cautious(2, 3), result.Confidence, 10);
    }

    [Fact]
    public void RanksByCautiousWinRate()
    {
        var deckA = Build.Eight(1);
        var deckB = Build.Eight(9);
        var battles = new List<BattleRecord>();
        foreach (var i in Enumerable.Range(1, 20))
        {
            battles.Add(Build.Battle($"#A{i}", deckA, BattleResult.Win));
        }
        battles.Add(Build.Battle("#B1", deckB, BattleResult.Win));
        battles.Add(Build.Battle("#B2", deckB, BattleResult.Loss));

        var result = NewBuilder().AggregateBattles(battles);

        Assert.Equal(2, result.Count);
        Assert.True(result[0].CardIds.SequenceEqual(deckA));
    }

    [Fact]
    public void RanksAProvenDeck_AboveASixForSixDeck()
    {
        // The Wilson bound ranked 6/6 (0.61) above 180/300 (0.54); the cautious estimate gives 0.518 vs 0.566.
        var tiny = Build.Eight(1);
        var proven = Build.Eight(9);
        var battles = new List<BattleRecord>();
        foreach (var i in Enumerable.Range(1, 6))
        {
            battles.Add(Build.Battle($"#T{i}", tiny, BattleResult.Win));
        }
        foreach (var i in Enumerable.Range(1, 300))
        {
            battles.Add(Build.Battle($"#P{i}", proven, i <= 180 ? BattleResult.Win : BattleResult.Loss));
        }

        var result = NewBuilder().AggregateBattles(battles);

        Assert.True(result[0].CardIds.SequenceEqual(proven));
    }

    [Fact]
    public void RanksAProvenDeck_AboveAHotStreak()
    {
        // 20/25 vs 330/550: 30-game shrinkage ranked the streak first (0.636 vs 0.595); cautious gives 0.555 vs 0.577.
        var streak = Build.Eight(1);
        var proven = Build.Eight(9);
        var battles = new List<BattleRecord>();
        foreach (var i in Enumerable.Range(1, 25))
        {
            battles.Add(Build.Battle($"#S{i}", streak, i <= 20 ? BattleResult.Win : BattleResult.Loss));
        }
        foreach (var i in Enumerable.Range(1, 550))
        {
            battles.Add(Build.Battle($"#P{i}", proven, i <= 330 ? BattleResult.Win : BattleResult.Loss));
        }

        var result = NewBuilder().AggregateBattles(battles);

        Assert.True(result[0].CardIds.SequenceEqual(proven));
    }

    [Fact]
    public void PreEpochBattles_CountAtReducedWeight()
    {
        var deck = Build.Eight(1);
        var epoch = BattleRepository.ParseBattleTime("20260115T000000.000Z");
        var battles = new[]
        {
            Build.Battle("#P1", deck, BattleResult.Win, "20260110T120000.000Z"),
            Build.Battle("#P2", deck, BattleResult.Win, "20260110T130000.000Z"),
            Build.Battle("#P3", deck, BattleResult.Loss, "20260120T120000.000Z"),
            Build.Battle("#P4", deck, BattleResult.Loss, "20260120T130000.000Z"),
        };

        var result = Assert.Single(NewBuilder().AggregateBattles(battles, epoch));

        Assert.Equal(4, result.Uses);
        Assert.Equal(0.5 / 2.5, result.WinRate, 10);
        Assert.Equal(Cautious(0.5, 2.5), result.Confidence, 10);
    }

    [Fact]
    public void BattlesAtOrAfterTheEpoch_KeepFullWeight()
    {
        var deck = Build.Eight(1);
        var boundary = "20260115T000000.000Z";
        var epoch = BattleRepository.ParseBattleTime(boundary);
        var battles = new[]
        {
            Build.Battle("#P1", deck, BattleResult.Win, boundary),
            Build.Battle("#P2", deck, BattleResult.Loss, "20260120T120000.000Z"),
        };

        var result = Assert.Single(NewBuilder().AggregateBattles(battles, epoch));
        Assert.Equal(0.5, result.WinRate, 10);
        Assert.Equal(Cautious(1, 2), result.Confidence, 10);
    }

    [Fact]
    public void WithoutAnEpoch_AllBattlesKeepFullWeight()
    {
        var deck = Build.Eight(1);
        var battles = new[]
        {
            Build.Battle("#P1", deck, BattleResult.Win, "20200101T120000.000Z"),
            Build.Battle("#P2", deck, BattleResult.Loss, "20260101T120000.000Z"),
        };

        var result = Assert.Single(NewBuilder().AggregateBattles(battles));
        Assert.Equal(0.5, result.WinRate, 10);
    }

    [Fact]
    public void TracksTheMostCommonVersionLoadout_NotTheLatestBattles()
    {
        var deck = Build.Eight(1);
        var hero = new List<CardVersion> { new(1, CardVersionKind.Hero) };
        var plain = new List<CardVersion> { new(1, CardVersionKind.Normal) };
        var battles = new[]
        {
            Build.Battle("#P1", deck, BattleResult.Win, "20260101T120000.000Z", hero),
            Build.Battle("#P2", deck, BattleResult.Win, "20260102T120000.000Z", hero),
            Build.Battle("#P3", deck, BattleResult.Win, "20260115T120000.000Z", plain),
        };

        var result = Assert.Single(NewBuilder().AggregateBattles(battles));
        Assert.Equal(CardVersionKind.Hero, result.CardVersions!.Single(v => v.CardId == 1).Version);
    }

    [Fact]
    public void BreaksVersionLoadoutTies_ByRecency()
    {
        var deck = Build.Eight(1);
        var older = new List<CardVersion> { new(1, CardVersionKind.Normal) };
        var newer = new List<CardVersion> { new(1, CardVersionKind.Evo) };
        var battles = new[]
        {
            Build.Battle("#P1", deck, BattleResult.Win, "20260101T120000.000Z", older),
            Build.Battle("#P2", deck, BattleResult.Win, "20260115T120000.000Z", newer),
        };

        var result = Assert.Single(NewBuilder().AggregateBattles(battles));
        Assert.Equal(CardVersionKind.Evo, result.CardVersions!.Single(v => v.CardId == 1).Version);
    }
}
