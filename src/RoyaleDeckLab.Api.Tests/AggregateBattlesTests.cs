using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
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
        // effectiveWins = 1 win + 0.5 draw = 1.5 over 3 games.
        Assert.Equal(0.5, result.WinRate, 10);
        Assert.Equal(1.0, result.PickRate!.Value, 10); // 3 of 3 sampled players ran it
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
        Assert.Equal(0.75, result.WinRate, 10); // (1 + 0.5) / 2
    }

    [Fact]
    public void DropsSingleGameNoise()
    {
        // A deck seen in only one battle is below the 2-game floor and is discarded.
        var battles = new[] { Build.Battle("#P1", Build.Eight(1), BattleResult.Win) };
        Assert.Empty(NewBuilder().AggregateBattles(battles));
    }

    [Fact]
    public void ConfidenceIsTheWilsonBound_OnEffectiveWins()
    {
        var deck = Build.Eight(1);
        var battles = new[]
        {
            Build.Battle("#P1", deck, BattleResult.Win),
            Build.Battle("#P2", deck, BattleResult.Win),
            Build.Battle("#P3", deck, BattleResult.Loss),
        };

        var result = Assert.Single(NewBuilder().AggregateBattles(battles));
        Assert.Equal(MetaBuilder.WilsonLowerBound(2, 3), result.Confidence, 10);
    }

    [Fact]
    public void RanksByConfidenceWeightedByPopularity()
    {
        // Deck A: proven and broadly played. Deck B: fewer players, weaker record.
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
        Assert.True(result[0].CardIds.SequenceEqual(deckA)); // strongest first
    }

    [Fact]
    public void TracksTheMostCommonVersionLoadout_NotTheLatestBattles()
    {
        // Two battles field the hero, one later battle (a player without it)
        // fields the plain card: the majority loadout must win, or one outlier
        // relabels the deck.
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
