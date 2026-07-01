using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class BestDecksBuilderTests
{
    private readonly BestDecksBuilder _builder = new();

    [Fact]
    public void EachSetHoldsFourCardDisjointDecks()
    {
        var meta = Enumerable.Range(0, 8).Select(i => Build.Deck(Build.Eight(1 + i * 8))).ToList();
        var catalog = Build.CatalogMap(Enumerable.Range(1, 8 * 8));

        var sets = _builder.Build(meta, catalog);

        Assert.NotEmpty(sets);
        Assert.All(sets, set =>
        {
            Assert.Equal(4, set.Decks.Count);
            var cards = set.Decks.SelectMany(d => d.CardIds).ToList();
            Assert.Equal(cards.Count, cards.Distinct().Count());
        });
    }

    [Fact]
    public void ReturnsAtMostTenSets()
    {
        var meta = Enumerable.Range(0, 60).Select(i => Build.Deck(Build.Eight(1 + i * 8))).ToList();
        var catalog = Build.CatalogMap(Enumerable.Range(1, 60 * 8));

        Assert.True(_builder.Build(meta, catalog).Count <= 10);
    }

    [Fact]
    public void ExcludesDecks_BelowTheMinimumPlayerFloor()
    {
        // A deck run by only 3 players is under the floor (5) and must never surface.
        var meta = new List<DeckMeta>
        {
            Build.Deck(Build.Eight(1), players: 20),
            Build.Deck(Build.Eight(9), players: 20),
            Build.Deck(Build.Eight(17), players: 20),
            Build.Deck(Build.Eight(25), players: 20),
            Build.Deck(Build.Eight(33), players: 3),
        };
        var catalog = Build.CatalogMap(Enumerable.Range(1, 40));

        var sets = _builder.Build(meta, catalog);

        var allCardIds = sets.SelectMany(s => s.Decks).SelectMany(d => d.CardIds).ToHashSet();
        Assert.DoesNotContain(33, allCardIds);
    }

    [Fact]
    public void CollapsesNearDuplicateDecks_IntoOneArchetype()
    {
        // deckB shares 7 of 8 cards with deckA (>= the 6-card archetype threshold),
        // so it's a variant and must never appear alongside the archetypes.
        var deckA = Build.Eight(1);              // 1..8
        var deckB = new[] { 1, 2, 3, 4, 5, 6, 7, 99 }; // shares 7 with A
        var meta = new List<DeckMeta>
        {
            Build.Deck(deckA, confidence: 0.60),
            Build.Deck(deckB, confidence: 0.59),
            Build.Deck(Build.Eight(9)),
            Build.Deck(Build.Eight(17)),
            Build.Deck(Build.Eight(25)),
        };
        var catalog = Build.CatalogMap(Enumerable.Range(1, 40).Append(99));

        var sets = _builder.Build(meta, catalog);

        var usedKeys = sets.SelectMany(s => s.Decks).Select(d => string.Join(',', d.CardIds)).ToHashSet();
        Assert.DoesNotContain(string.Join(',', deckB), usedKeys);
    }

    [Fact]
    public void ForcesChampionsToHero_FromTheCatalogRarity()
    {
        var meta = new[] { 1, 9, 17, 25 }.Select(s => Build.Deck(Build.Eight(s), versions: null)).ToList();
        var catalog = Build.CatalogMap(Enumerable.Range(1, 32), championId: 1);

        var sets = _builder.Build(meta, catalog);

        var entry = sets.SelectMany(s => s.Decks).First(d => d.CardIds.Contains(1));
        Assert.Equal(CardVersionKind.Hero, entry.CardVersions.Single(v => v.CardId == 1).Version);
    }
}
