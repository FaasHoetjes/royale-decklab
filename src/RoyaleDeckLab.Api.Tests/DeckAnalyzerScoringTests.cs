using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DeckAnalyzerScoringTests
{
    private readonly DeckAnalyzer _analyzer = new();

    [Fact]
    public void Fieldability_IsOne_WhenEveryCardIsMaxed()
    {
        var cards = Build.Collection(1, 2, 3, 4, 5, 6, 7, 8);
        Assert.Equal(1.0, _analyzer.FieldabilityScore(cards, [1, 2, 3, 4, 5, 6, 7, 8])!.Value, 10);
    }

    [Fact]
    public void Fieldability_FollowsTheTenPercentPerLevelCurve()
    {
        var cards = new List<PlayerItemLevel> { Build.Card(1, level: 13, maxLevel: 14) };
        Assert.Equal(Math.Pow(1.10, -1), _analyzer.FieldabilityScore(cards, [1])!.Value, 10);
    }

    [Fact]
    public void Fieldability_IsNull_WhenACardIsMissing()
    {
        var cards = Build.Collection(1, 2);
        Assert.Null(_analyzer.FieldabilityScore(cards, [1, 2, 3]));
    }

    [Fact]
    public void PlayerScore_IsNull_WhenACardIsMissing()
    {
        var cards = Build.Collection(1, 2, 3, 4, 5, 6, 7);
        var deck = Build.Deck(Build.Eight(1));
        Assert.Null(_analyzer.ScoreDeckForPlayer(cards, deck, deck.CardVersions));
    }

    [Fact]
    public void PlayerScore_ForMaxedDeck_IsConfidenceTimesPopularity()
    {
        var cards = Build.Collection(Build.Eight(1));
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20);

        // confidence x levelWeight(1) x versionFit(1) x popularityFactor(20) with prior 8.
        var expected = 0.55 * (20.0 / 28.0);
        Assert.Equal(expected, _analyzer.ScoreDeckForPlayer(cards, deck, deck.CardVersions)!.Value, 10);
    }

    [Fact]
    public void PlayerScore_AppliesTheMissingSpecialPenalty_ForAnUnownedEvo()
    {
        var cards = Build.Collection(Build.Eight(1));
        var versions = new List<CardVersion> { new(1, CardVersionKind.Evo) };
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20, versions: versions);

        var expected = 0.55 * (20.0 / 28.0) * 0.94;
        Assert.Equal(expected, _analyzer.ScoreDeckForPlayer(cards, deck, versions)!.Value, 10);
    }

    [Fact]
    public void PlayerScore_DoesNotPenalise_AnOwnedEvo()
    {
        var cards = new List<PlayerItemLevel> { Build.Card(1, evo: 1) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var versions = new List<CardVersion> { new(1, CardVersionKind.Evo) };
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20, versions: versions);

        var expected = 0.55 * (20.0 / 28.0);
        Assert.Equal(expected, _analyzer.ScoreDeckForPlayer(cards, deck, versions)!.Value, 10);
    }

    [Fact]
    public void PlayerScore_ExemptsChampions_FromTheVersionPenalty()
    {
        // Champions have no hero/evo tier, so a "hero" meta version must not penalise them.
        var cards = new List<PlayerItemLevel> { Build.Card(1, rarity: Rarity.Champion) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var versions = new List<CardVersion> { new(1, CardVersionKind.Hero) };
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20, versions: versions);

        var expected = 0.55 * (20.0 / 28.0);
        Assert.Equal(expected, _analyzer.ScoreDeckForPlayer(cards, deck, versions)!.Value, 10);
    }

    [Fact]
    public void PlayerScore_CompoundsLevelDeficits_InOddsSpace()
    {
        // 8 cards one level short (S=1.1⁻¹): the deficit compounds as S⁴ on the win odds, not linearly on the score.
        var cards = Enumerable.Range(1, 8).Select(id => Build.Card(id, level: 13)).ToList();
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20);

        var odds = 0.55 / 0.45 * Math.Pow(1.10, -4);
        var expected = odds / (1 + odds) * (20.0 / 28.0);
        Assert.Equal(expected, _analyzer.ScoreDeckForPlayer(cards, deck, deck.CardVersions)!.Value, 10);
    }

    [Fact]
    public void PlayerScore_PrefersANearMaxedDeck_OverAnUnderleveledStrongerDeck()
    {
        // Regression check: the old linear model ranked the underleveled 60% deck above the near-maxed 51% deck.
        var cards = Enumerable.Range(1, 4).Select(id => Build.Card(id, level: 12))
            .Concat(Enumerable.Range(5, 4).Select(id => Build.Card(id, level: 11)))
            .Concat(Enumerable.Range(9, 8).Select(id => Build.Card(id, level: 13)))
            .ToList();
        var strongButUnderleveled = Build.Deck(Build.Eight(1), confidence: 0.60);
        var modestButNearMaxed = Build.Deck(Build.Eight(9), confidence: 0.51);

        var strongScore = _analyzer.ScoreDeckForPlayer(cards, strongButUnderleveled, null)!.Value;
        var modestScore = _analyzer.ScoreDeckForPlayer(cards, modestButNearMaxed, null)!.Value;

        Assert.True(modestScore > strongScore,
            $"Expected the near-maxed 51% deck ({modestScore:F4}) to outrank the 2.5-levels-down 60% deck ({strongScore:F4})");
    }

    [Fact]
    public void PlayerScore_TreatsMissingPlayerCount_AsFullPopularity()
    {
        var cards = Build.Collection(Build.Eight(1));
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: null);
        // popularityFactor(null) == 1, so the score is just the confidence.
        Assert.Equal(0.55, _analyzer.ScoreDeckForPlayer(cards, deck, deck.CardVersions)!.Value, 10);
    }

    [Fact]
    public void BuilderDeck_MatchingMeta_ScoresIdenticallyAndFlagsMeta()
    {
        var cards = Build.Collection(Build.Eight(1));
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20);

        var result = _analyzer.ScoreBuilderDeck(cards, Build.Eight(1), deck);

        Assert.NotNull(result);
        Assert.True(result!.IsMeta);
        Assert.Equal(0.55, result.WinRate, 10);
        Assert.Equal(20, result.Players);
        Assert.Equal(_analyzer.ScoreDeckForPlayer(cards, deck, deck.CardVersions)!.Value, result.Score, 10);
    }

    [Fact]
    public void BuilderDeck_WithoutMeta_UsesTheNeutralPrior()
    {
        var cards = Build.Collection(Build.Eight(1));

        var result = _analyzer.ScoreBuilderDeck(cards, Build.Eight(1), meta: null);

        Assert.NotNull(result);
        Assert.False(result!.IsMeta);
        Assert.Equal(0.5, result.WinRate, 10);
        Assert.Equal(0, result.Players);
        // 0.5 (neutral) x fieldability(1) x popularityFactor(1) with prior 8 => 0.5/9.
        Assert.Equal(0.5 * (1.0 / 9.0), result.Score, 10);
    }

    [Fact]
    public void BuilderDeck_IsNull_WhenACardIsMissing()
    {
        var cards = Build.Collection(1, 2, 3);
        Assert.Null(_analyzer.ScoreBuilderDeck(cards, Build.Eight(1), meta: null));
    }
}
