using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>
/// The map-based ScoreBuilderDeck/FieldabilityScore overloads exist so the deck
/// builder endpoint indexes the collection once instead of per deck — they must
/// stay score-identical to the list-based originals.
/// </summary>
public sealed class ScoreBuilderDeckOverloadTests
{
    private readonly DeckAnalyzer _analyzer = new();

    [Fact]
    public void FieldabilityScore_MapAndListOverloads_Agree()
    {
        var cards = Build.Collection(Build.Eight(1));
        cards[0] = Build.Card(1, level: 11);

        var fromList = _analyzer.FieldabilityScore(cards, Build.Eight(1));
        var fromMap = _analyzer.FieldabilityScore(Build.CardMap(cards), Build.Eight(1));

        Assert.Equal(fromList, fromMap);
    }

    [Fact]
    public void ScoreBuilderDeck_MetaDeck_MapAndListOverloads_Agree()
    {
        var cards = Build.Collection(Build.Eight(1));
        var meta = Build.Deck(Build.Eight(1));

        var fromList = _analyzer.ScoreBuilderDeck(cards, Build.Eight(1), meta);
        var fromMap = _analyzer.ScoreBuilderDeck(Build.CardMap(cards), Build.Eight(1), meta);

        Assert.NotNull(fromList);
        Assert.Equal(fromList, fromMap);
        Assert.True(fromMap!.IsMeta);
    }

    [Fact]
    public void ScoreBuilderDeck_UnprovenDeck_MapAndListOverloads_Agree()
    {
        var cards = Build.Collection(Build.Eight(1));

        var fromList = _analyzer.ScoreBuilderDeck(cards, Build.Eight(1), meta: null);
        var fromMap = _analyzer.ScoreBuilderDeck(Build.CardMap(cards), Build.Eight(1), meta: null);

        Assert.NotNull(fromList);
        Assert.Equal(fromList, fromMap);
        Assert.False(fromMap!.IsMeta);
    }

    [Fact]
    public void ScoreBuilderDeck_MissingCard_ReturnsNull_InBothOverloads()
    {
        var cards = Build.Collection(1, 2, 3); // deck needs 1..8

        Assert.Null(_analyzer.ScoreBuilderDeck(cards, Build.Eight(1), meta: null));
        Assert.Null(_analyzer.ScoreBuilderDeck(Build.CardMap(cards), Build.Eight(1), meta: null));
    }
}
