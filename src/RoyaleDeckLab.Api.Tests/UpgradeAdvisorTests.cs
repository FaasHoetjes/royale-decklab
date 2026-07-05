using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class UpgradeAdvisorTests
{
    private readonly UpgradeAdvisor _advisor = new(new DeckAnalyzer());

    [Fact]
    public void SuggestsAnUnderleveledCard_InARecommendedDeck()
    {
        // Card 1 is one level short; everything else is maxed.
        var cards = new List<PlayerItemLevel> { Build.Card(1, level: 13) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var meta = new[] { Build.Deck(Build.Eight(1)) };

        var advice = _advisor.Advise(cards, meta);

        var suggestion = Assert.Single(advice.Suggestions);
        Assert.Equal(1, suggestion.CardId);
        Assert.Equal(13, suggestion.FromLevel);
        Assert.Equal(14, suggestion.ToLevel);
        Assert.True(suggestion.ScoreDelta > 0);
        Assert.Equal(advice.BaselineScore + suggestion.ScoreDelta, suggestion.NewTotalScore, 10);
        Assert.False(suggestion.ChangesLineup);
        Assert.Equal([0], suggestion.AffectedDeckIndexes);
    }

    [Fact]
    public void IgnoresCards_AtMaxLevel_OrOutsideEveryMetaDeck()
    {
        // Card 99 is underleveled but appears in no meta deck; the rest are maxed.
        var cards = Build.Collection(Build.Eight(1))
            .Concat([Build.Card(99, level: 10)]).ToList();
        var meta = new[] { Build.Deck(Build.Eight(1)) };

        var advice = _advisor.Advise(cards, meta);

        Assert.Empty(advice.Suggestions);
    }

    [Fact]
    public void RanksTheUpgradeInTheStrongerDeck_First()
    {
        // Two disjoint picked decks, one clearly stronger. Each contains one card
        // a level short; the same level gain is worth more in the stronger deck.
        var cards = new List<PlayerItemLevel> { Build.Card(1, level: 13), Build.Card(9, level: 13) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16)).ToList();
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), confidence: 0.60),
            Build.Deck(Build.Eight(9), confidence: 0.30),
        };

        var advice = _advisor.Advise(cards, meta);

        Assert.Equal(2, advice.Suggestions.Count);
        Assert.Equal(1, advice.Suggestions[0].CardId);
        Assert.Equal(9, advice.Suggestions[1].CardId);
        Assert.True(advice.Suggestions[0].ScoreDelta > advice.Suggestions[1].ScoreDelta);
    }

    [Fact]
    public void ReturnsEveryPositiveSuggestion_NotJustTheTopTen()
    {
        // Two disjoint picked decks, all 16 cards a level short: each card is a
        // distinct positive suggestion and none may be cut off by a result cap —
        // the client filters and paginates, the advisor must not truncate.
        var cards = Enumerable.Range(1, 16).Select(id => Build.Card(id, level: 13)).ToList();
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), confidence: 0.60),
            Build.Deck(Build.Eight(9), confidence: 0.55),
        };

        var advice = _advisor.Advise(cards, meta);

        Assert.Equal(16, advice.Suggestions.Count);
    }

    [Fact]
    public void StaysFast_WithAMetaSizedPool_AndAFullyUpgradeableCollection()
    {
        // The advisor runs the exact lineup search a few times per upgradeable
        // card (one level, the max-level probe, and a short jump scan when the
        // probe hits) — here ~110 cards two levels below max over 1500 near-tied
        // decks, the worst realistic load. The generous ceiling only catches
        // pathological regressions.
        var rng = new Random(7);
        var cards = Enumerable.Range(1, 110).Select(id => Build.Card(id, level: 12)).ToList();
        var meta = Enumerable.Range(0, 1500)
            .Select(_ => Build.Deck(
                Enumerable.Range(1, 110).OrderBy(_ => rng.Next()).Take(8).ToArray(),
                confidence: 0.40 + 0.15 * rng.NextDouble(),
                players: 5 + rng.Next(200)))
            .ToList();

        var watch = System.Diagnostics.Stopwatch.StartNew();
        var advice = _advisor.Advise(cards, meta);
        watch.Stop();

        Assert.NotEmpty(advice.Suggestions);
        Assert.True(watch.ElapsedMilliseconds < 5000,
            $"Advise took {watch.ElapsedMilliseconds} ms; expected well under 5000 ms");
    }

    [Fact]
    public void FlagsALineupChange_WhenAnUpgradePromotesADifferentDeck()
    {
        // Decks X (cards 1-8) and Y (cards 1-7 + 9) overlap, so only one is picked.
        // With card 9 two levels short, X edges out Y; one upgrade flips the pick.
        // Odds-space level adjustment (exponent 4), odds = 0.60/0.40 = 1.5:
        //   Y before: S = (7 + 1.1^-2)/8 → w' = 1.5S⁴/(1+1.5S⁴) ≈ 0.5788 < X's 0.58
        //   Y after:  S = (7 + 1.1^-1)/8 → w' ≈ 0.5890 > X's 0.58
        var cards = Build.Collection(1, 2, 3, 4, 5, 6, 7, 8)
            .Concat([Build.Card(9, level: 12)]).ToList();
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), confidence: 0.58),
            Build.Deck([1, 2, 3, 4, 5, 6, 7, 9], confidence: 0.60),
        };

        var advice = _advisor.Advise(cards, meta);

        var suggestion = Assert.Single(advice.Suggestions);
        Assert.Equal(9, suggestion.CardId);
        Assert.True(suggestion.ChangesLineup);
        // Card 9 isn't in the baseline lineup — the upgrade earns a new deck instead.
        Assert.Empty(suggestion.AffectedDeckIndexes);
    }

    [Fact]
    public void ReportsTheCheapestLevelJump_WhenOneLevelChangesNothing()
    {
        // Decks X (cards 1-8) and Y (cards 1-7 + 9) overlap, so only one is picked.
        // Card 9 sits three levels short; odds = 0.60/0.40 = 1.5, exponent 4:
        //   Y at 11: S = (7 + 1.1⁻³)/8 → w' ≈ 0.5693 < X's 0.58
        //   Y at 12: S = (7 + 1.1⁻²)/8 → w' ≈ 0.5788 < X's 0.58  (one level: no change)
        //   Y at 13: S = (7 + 1.1⁻¹)/8 → w' ≈ 0.5890 > X's 0.58  (two levels flip it)
        // One level moves no score at all (Y stays unpicked), so the only
        // suggestion is the two-level jump.
        var cards = Build.Collection(1, 2, 3, 4, 5, 6, 7, 8)
            .Concat([Build.Card(9, level: 11)]).ToList();
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), confidence: 0.58),
            Build.Deck([1, 2, 3, 4, 5, 6, 7, 9], confidence: 0.60),
        };

        var advice = _advisor.Advise(cards, meta);

        var suggestion = Assert.Single(advice.Suggestions);
        Assert.Equal(UpgradeKind.Level, suggestion.Kind);
        Assert.Equal(9, suggestion.CardId);
        Assert.Equal(11, suggestion.FromLevel);
        Assert.Equal(13, suggestion.ToLevel);
        Assert.True(suggestion.ChangesLineup);
        Assert.True(suggestion.ScoreDelta > 0);
        Assert.Empty(suggestion.AffectedDeckIndexes);
    }

    [Fact]
    public void SkipsTheJumpSearch_WhenEvenMaxLevelChangesNothing()
    {
        // Card 1 is four levels short with no competing deck to promote: only the
        // one-level suggestion appears, never a deeper jump (a jump that doesn't
        // change the lineup is just "+1 several times" — no new information).
        var cards = new List<PlayerItemLevel> { Build.Card(1, level: 10) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var meta = new[] { Build.Deck(Build.Eight(1)) };

        var advice = _advisor.Advise(cards, meta);

        var suggestion = Assert.Single(advice.Suggestions);
        Assert.Equal(UpgradeKind.Level, suggestion.Kind);
        Assert.Equal(11, suggestion.ToLevel);
    }

    [Fact]
    public void SuggestsAnEvoUnlock_WhenTheMetaFieldsIt()
    {
        // Everything maxed, but the meta deck fields card 1's Evolution and the
        // player hasn't unlocked it — the ×0.94 penalty is the entire headroom.
        var cards = Build.Collection(Build.Eight(1));
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), versions: [new CardVersion(1, CardVersionKind.Evo)]),
        };

        var advice = _advisor.Advise(cards, meta);

        var suggestion = Assert.Single(advice.Suggestions);
        Assert.Equal(UpgradeKind.Evo, suggestion.Kind);
        Assert.Equal(1, suggestion.CardId);
        Assert.Equal(suggestion.FromLevel, suggestion.ToLevel);
        // Unlocking removes the missing-special multiplier: baseline / 0.94.
        Assert.Equal(advice.BaselineScore * (1 / 0.94 - 1), suggestion.ScoreDelta, 10);
        Assert.False(suggestion.ChangesLineup);
        Assert.Equal([0], suggestion.AffectedDeckIndexes);
        // Levels are all maxed, but a locked fielded evo means NOT collection-maxed.
        Assert.False(advice.CollectionMaxed);
    }

    [Fact]
    public void SuggestsAHeroUnlock_WhenOnlyTheEvoIsOwned()
    {
        // Card 2 has its Evolution (evolutionLevel 1) but not the Hero the meta
        // deck fields — only the hero unlock is suggested, not a re-unlock of
        // the evo the player already owns.
        var cards = new List<PlayerItemLevel> { Build.Card(2, evo: 1) }
            .Concat(Build.Collection(1, 3, 4, 5, 6, 7, 8)).ToList();
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), versions: [new CardVersion(2, CardVersionKind.Hero)]),
        };

        var advice = _advisor.Advise(cards, meta);

        var suggestion = Assert.Single(advice.Suggestions);
        Assert.Equal(UpgradeKind.Hero, suggestion.Kind);
        Assert.Equal(2, suggestion.CardId);
        Assert.Equal(advice.BaselineScore * (1 / 0.94 - 1), suggestion.ScoreDelta, 10);
        Assert.Equal([0], suggestion.AffectedDeckIndexes);
    }

    [Fact]
    public void ReportsCollectionMaxed_OnlyWhenNothingIsSimulatable()
    {
        // Every meta card at max level, nothing to unlock: maxed. Card 99 is
        // underleveled but outside every meta deck, so it doesn't count.
        var cards = Build.Collection(Build.Eight(1))
            .Concat([Build.Card(99, level: 10)]).ToList();
        var meta = new[] { Build.Deck(Build.Eight(1)) };

        var advice = _advisor.Advise(cards, meta);

        Assert.Empty(advice.Suggestions);
        Assert.True(advice.CollectionMaxed);
    }

    [Fact]
    public void DoesNotReportMaxed_WhenAnUpgradeExistsButNoneHelps()
    {
        // Card 9 is upgradeable, but its deck loses to the incumbent even maxed —
        // no suggestion, yet the collection is NOT maxed. This is the case the
        // client's generic "nothing moves your lineup" copy is for.
        var cards = Build.Collection(1, 2, 3, 4, 5, 6, 7, 8)
            .Concat([Build.Card(9, level: 13)]).ToList();
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), confidence: 0.60),
            Build.Deck([1, 2, 3, 4, 5, 6, 7, 9], confidence: 0.40),
        };

        var advice = _advisor.Advise(cards, meta);

        Assert.Empty(advice.Suggestions);
        Assert.False(advice.CollectionMaxed);
    }

    [Fact]
    public void NeverSuggestsUnlocks_ForChampions()
    {
        // Champions are a rarity, not an evolution: owning the card is owning the
        // champion, and scoring never penalizes them, so there is nothing to unlock.
        var cards = new List<PlayerItemLevel> { Build.Card(1, rarity: Rarity.Champion) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), versions: [new CardVersion(1, CardVersionKind.Hero)]),
        };

        var advice = _advisor.Advise(cards, meta);

        Assert.Empty(advice.Suggestions);
    }
}
