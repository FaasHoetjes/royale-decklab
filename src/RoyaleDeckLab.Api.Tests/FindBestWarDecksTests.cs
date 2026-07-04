using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class FindBestWarDecksTests
{
    private readonly DeckAnalyzer _analyzer = new();

    private WarDeckResult Run(IReadOnlyList<PlayerItemLevel> cards, IReadOnlyList<DeckMeta> meta)
        => _analyzer.FindBestWarDecks(meta, Build.CardMap(cards));

    [Fact]
    public void ReturnsFourDecks_ThatShareNoCards()
    {
        var cards = Build.Collection(Enumerable.Range(1, 40).ToArray());
        var meta = new[] { 1, 9, 17, 25, 33 }.Select(s => Build.Deck(Build.Eight(s))).ToList();

        var result = Run(cards, meta);

        Assert.Equal(4, result.Decks.Count);
        var allCards = result.Decks.SelectMany(d => d.CardIds).ToList();
        Assert.Equal(allCards.Count, allCards.Distinct().Count()); // no card fielded twice
    }

    [Fact]
    public void TotalScore_IsTheSumOfThePickedDecks()
    {
        var cards = Build.Collection(Enumerable.Range(1, 40).ToArray());
        var meta = new[] { 1, 9, 17, 25, 33 }.Select(s => Build.Deck(Build.Eight(s))).ToList();

        var result = Run(cards, meta);

        Assert.Equal(result.Decks.Sum(d => d.PlayerScore), result.TotalScore, 10);
    }

    [Fact]
    public void Alternatives_ExcludeThePickedDecks()
    {
        var cards = Build.Collection(Enumerable.Range(1, 40).ToArray());
        var meta = new[] { 1, 9, 17, 25, 33 }.Select(s => Build.Deck(Build.Eight(s))).ToList();

        var result = Run(cards, meta);

        var pickedKeys = result.Decks.Select(d => string.Join(',', d.CardIds)).ToHashSet();
        Assert.All(result.Alternatives, alt => Assert.DoesNotContain(string.Join(',', alt.CardIds), pickedKeys));
        Assert.Single(result.Alternatives); // 5 fieldable - 4 picked
    }

    [Fact]
    public void RelaxesThePopularityGate_ToFillTheFourthSlot()
    {
        // Three well-adopted disjoint decks, plus a fourth run by only 2 players. The
        // strict floor (5) yields three; the ladder relaxes to admit the last one.
        var cards = Build.Collection(Enumerable.Range(1, 32).ToArray());
        var meta = new List<DeckMeta>
        {
            Build.Deck(Build.Eight(1), players: 10),
            Build.Deck(Build.Eight(9), players: 10),
            Build.Deck(Build.Eight(17), players: 10),
            Build.Deck(Build.Eight(25), players: 2),
        };

        var result = Run(cards, meta);

        Assert.Equal(4, result.Decks.Count);
        Assert.Contains(result.Decks, d => d.CardIds.SequenceEqual(Build.Eight(25)));
    }

    [Fact]
    public void SkipsDecks_ThePlayerCannotField()
    {
        var cards = Build.Collection(Build.Eight(1)); // owns deck 1 only
        var meta = new List<DeckMeta>
        {
            Build.Deck(Build.Eight(1)),
            Build.Deck(Build.Eight(9)), // needs cards the player lacks
        };

        var result = Run(cards, meta);

        Assert.Single(result.Decks);
        Assert.True(result.Decks[0].CardIds.SequenceEqual(Build.Eight(1)));
    }

    [Fact]
    public void PersonalisesArtwork_ButKeepsTheMetaSlotVersion_ForAnUnownedEvo()
    {
        var cards = Build.Collection(Build.Eight(1)); // card 1 owned, evo level 0
        var versions = new List<CardVersion> { new(1, CardVersionKind.Evo) };
        var meta = new[] { Build.Deck(Build.Eight(1), versions: versions) };

        var deck = Assert.Single(Run(cards, meta).Decks);

        // Meta (slot-driving) view keeps the evo; personalised (art) view downgrades it.
        Assert.Equal(CardVersionKind.Evo, deck.MetaCardVersions!.Single(v => v.CardId == 1).Version);
        Assert.Equal(CardVersionKind.Normal, deck.CardVersions!.Single(v => v.CardId == 1).Version);
    }

    [Fact]
    public void ForcesChampionsIntoTheHeroSlot_EvenWithoutAStoredVersion()
    {
        // Card 1 is a champion; the battlelog can't flag it, so version reconciliation
        // must force it to hero by identity.
        var cards = new List<PlayerItemLevel> { Build.Card(1, rarity: Rarity.Champion) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var meta = new[] { Build.Deck(Build.Eight(1), versions: null) };

        var deck = Assert.Single(Run(cards, meta).Decks);

        Assert.Equal(CardVersionKind.Hero, deck.MetaCardVersions!.Single(v => v.CardId == 1).Version);
        Assert.Equal(CardVersionKind.Hero, deck.CardVersions!.Single(v => v.CardId == 1).Version);
    }
}
