using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DeckAnalyzerScoringTests
{
    private readonly DeckAnalyzer _analyzer = new();

    // A collection of only maxed cards expects opponents at 8.8 + 0.43 x 16 = 15.68, so a maxed deck
    // sits 0.32 levels above them: +0.67 x 0.32 log-odds.
    private const double MaxedDeckEdge = 0.67 * (16 - 15.68);

    private static double Expected(double confidence, double levelLogit)
        => 1 / (1 + Math.Exp(-(Math.Log(confidence / (1 - confidence)) + levelLogit)));

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
    public void PlayerScore_ForMaxedDeck_IsTheLevelAdjustedConfidence()
    {
        var cards = Build.Collection(Build.Eight(1));
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20);

        // logit(confidence) + level edge, x versionFit(1); how many players run it no longer matters.
        var expected = Expected(0.55, MaxedDeckEdge);
        Assert.Equal(expected, _analyzer.ScoreDeckForPlayer(cards, deck, deck.CardVersions)!.Value, 10);
    }

    [Fact]
    public void PlayerScore_AppliesTheMissingSpecialPenalty_ForAnUnownedEvo()
    {
        var cards = Build.Collection(Build.Eight(1));
        var versions = new List<CardVersion> { new(1, CardVersionKind.Evo) };
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20, versions: versions);

        var expected = Expected(0.55, MaxedDeckEdge) * 0.94;
        Assert.Equal(expected, _analyzer.ScoreDeckForPlayer(cards, deck, versions)!.Value, 10);
    }

    [Fact]
    public void PlayerScore_DoesNotPenalise_AnOwnedEvo()
    {
        var cards = new List<PlayerItemLevel> { Build.Card(1, evo: 1) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var versions = new List<CardVersion> { new(1, CardVersionKind.Evo) };
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20, versions: versions);

        var expected = Expected(0.55, MaxedDeckEdge);
        Assert.Equal(expected, _analyzer.ScoreDeckForPlayer(cards, deck, versions)!.Value, 10);
    }

    [Fact]
    public void PlayerScore_AppliesTheMissingSpecialPenalty_ForAMetaEvo_WhenOnlyTheHeroIsOwned()
    {
        // evolutionLevel is a bitmask (1 = Evo, 2 = Hero): 2 alone is the Hero without the Evo.
        var cards = new List<PlayerItemLevel> { Build.Card(1, evo: 2) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var versions = new List<CardVersion> { new(1, CardVersionKind.Evo) };
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20, versions: versions);

        var expected = Expected(0.55, MaxedDeckEdge) * 0.94;
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

        var expected = Expected(0.55, MaxedDeckEdge);
        Assert.Equal(expected, _analyzer.ScoreDeckForPlayer(cards, deck, versions)!.Value, 10);
    }

    [Fact]
    public void PlayerScore_ShiftsTheWinOdds_ByTheLevelGapToTheExpectedOpponent()
    {
        // 32 maxed cards set the opponent level to 15.68; the deck itself is one level short (15) everywhere,
        // so it sits 0.68 levels below its opponents: -0.67 x 0.68 log-odds, no weakest-card term.
        var cards = Enumerable.Range(1, 8).Select(id => Build.Card(id, level: 13))
            .Concat(Build.Collection(Enumerable.Range(9, 32).ToArray()))
            .ToList();
        var deck = Build.Deck(Build.Eight(1), confidence: 0.55, players: 20);

        var expected = Expected(0.55, -0.67 * (15.68 - 15));
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
    public void PlayerScore_RanksOneBadlyUnderleveledCard_BelowAnEvenOneLevelGap()
    {
        // A card 5 levels down among maxed ones must not outrank a deck that is 1 level down everywhere:
        // in war data the weakest card costs extra on top of the deck's average level.
        var cards = Enumerable.Range(1, 8).Select(id => Build.Card(id, level: id == 1 ? 9 : 14))
            .Concat(Enumerable.Range(9, 8).Select(id => Build.Card(id, level: 13)))
            .ToList();
        var oneBadCard = Build.Deck(Build.Eight(1), confidence: 0.55);
        var evenGap = Build.Deck(Build.Eight(9), confidence: 0.55);

        var bad = _analyzer.ScoreDeckForPlayer(cards, oneBadCard, null)!.Value;
        var even = _analyzer.ScoreDeckForPlayer(cards, evenGap, null)!.Value;

        Assert.True(even > bad, $"Expected the even 1-level gap ({even:F4}) to outrank one card 5 down ({bad:F4})");
    }

    [Fact]
    public void PlayerScore_DoesNotReward_HowManyPlayersRunTheDeck()
    {
        // Popularity weighting picked decks that won less for other players; evidence size is already in
        // the cautious confidence, so a niche deck and a popular one with equal confidence score the same.
        var cards = Build.Collection(Build.Eight(1));
        var niche = Build.Deck(Build.Eight(1), confidence: 0.55, players: 5);
        var popular = Build.Deck(Build.Eight(1), confidence: 0.55, players: 500);

        Assert.Equal(
            _analyzer.ScoreDeckForPlayer(cards, popular, null)!.Value,
            _analyzer.ScoreDeckForPlayer(cards, niche, null)!.Value, 10);
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
        // 0.5 (neutral) shifted by the maxed level edge, x the 1/9 unproven-deck dampener.
        Assert.Equal(Expected(0.5, MaxedDeckEdge) / 9, result.Score, 10);
    }

    [Fact]
    public void BuilderDeck_IsNull_WhenACardIsMissing()
    {
        var cards = Build.Collection(1, 2, 3);
        Assert.Null(_analyzer.ScoreBuilderDeck(cards, Build.Eight(1), meta: null));
    }
}
