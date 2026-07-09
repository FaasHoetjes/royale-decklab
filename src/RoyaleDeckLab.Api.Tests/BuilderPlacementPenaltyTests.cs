using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>Builder slots are positional (1=Evo, 2=Hero, 3=either); an owned special parked outside its slot fields as normal.</summary>
public sealed class BuilderPlacementPenaltyTests
{
    private const double MissingSpecial = 0.94;

    private readonly DeckAnalyzer _analyzer = new();
    private static readonly int[] Ids = Build.Eight(1);

    private static List<int?> Slots(params int[] ids) => ids.Select(id => (int?)id).ToList();

    private static List<CardVersion> Versions(params CardVersion[] specials)
    {
        var byId = specials.ToDictionary(v => v.CardId);
        return Ids.Select(id => byId.GetValueOrDefault(id) ?? new CardVersion(id, CardVersionKind.Normal)).ToList();
    }

    [Fact]
    public void OwnedEvoInEvoSlot_NoPenalty()
    {
        var cards = Build.Collection(Ids);
        cards[0] = Build.Card(1, evo: 1);
        var map = Build.CardMap(cards);
        var meta = Build.Deck(Ids, versions: Versions(new CardVersion(1, CardVersionKind.Evo)));

        var baseline = _analyzer.ScoreBuilderDeck(map, Ids, meta)!;
        var placed = _analyzer.ScoreBuilderDeck(map, Ids, meta, Slots(1, 2, 3, 4, 5, 6, 7, 8))!;

        Assert.Equal(baseline.Score, placed.Score, 12);
    }

    [Fact]
    public void OwnedEvoInFlexSlot_NoPenalty()
    {
        var cards = Build.Collection(Ids);
        cards[0] = Build.Card(1, evo: 1);
        var map = Build.CardMap(cards);
        var meta = Build.Deck(Ids, versions: Versions(new CardVersion(1, CardVersionKind.Evo)));

        var baseline = _analyzer.ScoreBuilderDeck(map, Ids, meta)!;
        var placed = _analyzer.ScoreBuilderDeck(map, Ids, meta, Slots(2, 3, 1, 4, 5, 6, 7, 8))!;

        Assert.Equal(baseline.Score, placed.Score, 12);
    }

    [Fact]
    public void OwnedEvoInNormalSlot_CostsTheMissingSpecialMultiplier()
    {
        var cards = Build.Collection(Ids);
        cards[0] = Build.Card(1, evo: 1);
        var map = Build.CardMap(cards);
        var meta = Build.Deck(Ids, versions: Versions(new CardVersion(1, CardVersionKind.Evo)));

        var baseline = _analyzer.ScoreBuilderDeck(map, Ids, meta)!;
        var placed = _analyzer.ScoreBuilderDeck(map, Ids, meta, Slots(2, 3, 4, 5, 6, 7, 8, 1))!;

        Assert.Equal(baseline.Score * MissingSpecial, placed.Score, 12);
    }

    [Fact]
    public void OwnedHeroFieldsOnlyInHeroOrFlexSlot()
    {
        var cards = Build.Collection(Ids);
        cards[1] = Build.Card(2, evo: 2);
        var map = Build.CardMap(cards);
        var meta = Build.Deck(Ids, versions: Versions(new CardVersion(2, CardVersionKind.Hero)));

        var baseline = _analyzer.ScoreBuilderDeck(map, Ids, meta)!;
        var inHeroSlot = _analyzer.ScoreBuilderDeck(map, Ids, meta, Slots(1, 2, 3, 4, 5, 6, 7, 8))!;
        var inFlexSlot = _analyzer.ScoreBuilderDeck(map, Ids, meta, Slots(1, 3, 2, 4, 5, 6, 7, 8))!;
        // The evo slot can't field a Hero, so slot 1 misfields it like a normal slot.
        var inEvoSlot = _analyzer.ScoreBuilderDeck(map, Ids, meta, Slots(2, 1, 3, 4, 5, 6, 7, 8))!;

        Assert.Equal(baseline.Score, inHeroSlot.Score, 12);
        Assert.Equal(baseline.Score, inFlexSlot.Score, 12);
        Assert.Equal(baseline.Score * MissingSpecial, inEvoSlot.Score, 12);
    }

    [Fact]
    public void UnownedSpecial_MisplacementAddsNoSecondPenalty()
    {
        // Unowned: ScoreDeckForPlayer already applied the multiplier; placement must not stack a second one.
        var cards = Build.Collection(Ids);
        var map = Build.CardMap(cards);
        var meta = Build.Deck(Ids, versions: Versions(new CardVersion(1, CardVersionKind.Evo)));

        var baseline = _analyzer.ScoreBuilderDeck(map, Ids, meta)!;
        var misplaced = _analyzer.ScoreBuilderDeck(map, Ids, meta, Slots(2, 3, 4, 5, 6, 7, 8, 1))!;

        Assert.Equal(baseline.Score, misplaced.Score, 12);
    }

    [Fact]
    public void Champion_ExemptFromPlacementPenalty()
    {
        var cards = Build.Collection(Ids);
        cards[0] = Build.Card(1, rarity: Rarity.Champion);
        var map = Build.CardMap(cards);
        var meta = Build.Deck(Ids, versions: Versions(new CardVersion(1, CardVersionKind.Hero)));

        var baseline = _analyzer.ScoreBuilderDeck(map, Ids, meta)!;
        var placed = _analyzer.ScoreBuilderDeck(map, Ids, meta, Slots(2, 3, 4, 5, 6, 7, 8, 1))!;

        Assert.Equal(baseline.Score, placed.Score, 12);
    }

    [Fact]
    public void BothSpecialsMisplaced_PenaltiesCompound()
    {
        var cards = Build.Collection(Ids);
        cards[0] = Build.Card(1, evo: 1);
        cards[1] = Build.Card(2, evo: 2);
        var map = Build.CardMap(cards);
        var meta = Build.Deck(Ids, versions: Versions(
            new CardVersion(1, CardVersionKind.Evo),
            new CardVersion(2, CardVersionKind.Hero)));

        var baseline = _analyzer.ScoreBuilderDeck(map, Ids, meta)!;
        var placed = _analyzer.ScoreBuilderDeck(map, Ids, meta, Slots(3, 4, 5, 1, 2, 6, 7, 8))!;

        Assert.Equal(baseline.Score * MissingSpecial * MissingSpecial, placed.Score, 12);
    }

    [Fact]
    public void NonMetaDeck_PlacementIgnored()
    {
        var cards = Build.Collection(Ids);
        cards[0] = Build.Card(1, evo: 1);
        var map = Build.CardMap(cards);

        var baseline = _analyzer.ScoreBuilderDeck(map, Ids, meta: null)!;
        var placed = _analyzer.ScoreBuilderDeck(map, Ids, meta: null, Slots(2, 3, 4, 5, 6, 7, 8, 1))!;

        Assert.Equal(baseline.Score, placed.Score, 12);
    }

    [Fact]
    public void ListAndMapOverloads_AgreeWithSlots()
    {
        var cards = Build.Collection(Ids);
        cards[0] = Build.Card(1, evo: 1);
        var meta = Build.Deck(Ids, versions: Versions(new CardVersion(1, CardVersionKind.Evo)));
        var slots = Slots(2, 3, 4, 5, 6, 7, 8, 1);

        var fromList = _analyzer.ScoreBuilderDeck(cards, Ids, meta, slots);
        var fromMap = _analyzer.ScoreBuilderDeck(Build.CardMap(cards), Ids, meta, slots);

        Assert.NotNull(fromList);
        Assert.Equal(fromList, fromMap);
    }
}
