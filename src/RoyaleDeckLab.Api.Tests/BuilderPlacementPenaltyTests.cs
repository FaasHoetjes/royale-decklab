using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>
/// The builder's placement penalty: the in-game special slots are positional
/// (slot 1 fields an Evo, slot 2 a Hero, slot 3 either), so a meta special the
/// player OWNS but parks in a normal slot fields as the normal version and costs
/// the same multiplier as not owning it — while an UNOWNED special is priced by
/// the ownership check alone and never penalized twice.
/// </summary>
public sealed class BuilderPlacementPenaltyTests
{
    // DeckAnalyzer.MissingSpecialMultiplier — one special not fielded ≈ 6% weaker.
    private const double MissingSpecial = 0.94;

    private readonly DeckAnalyzer _analyzer = new();
    private static readonly int[] Ids = Build.Eight(1);

    /// <summary>A positional 8-slot deck, as the builder posts it.</summary>
    private static List<int?> Slots(params int[] ids) => ids.Select(id => (int?)id).ToList();

    /// <summary>One version entry per deck card: the given specials, rest normal.</summary>
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
        // The player doesn't own the evo, so the ownership check inside
        // ScoreDeckForPlayer already applied the multiplier — placement must not
        // stack another one on top.
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
