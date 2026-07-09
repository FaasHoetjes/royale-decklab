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
        var cards = Build.Collection(Build.Eight(1))
            .Concat([Build.Card(99, level: 10)]).ToList();
        var meta = new[] { Build.Deck(Build.Eight(1)) };

        var advice = _advisor.Advise(cards, meta);

        Assert.Empty(advice.Suggestions);
    }

    [Fact]
    public void RanksTheUpgradeInTheStrongerDeck_First()
    {
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
        // The client filters and paginates; the advisor itself must not truncate.
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
        // ~110 cards two levels below max over 1500 near-tied decks: the worst realistic load.
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
        // X (1-8) and Y (1-7,9) overlap, so only one is picked. Odds-space, odds=1.5, exponent 4:
        // Y at level 12 (S=1.1⁻¹) scores ≈0.589, edging out X's 0.58 - the one-level bump to card 9 flips the pick.
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
        // Card 9 isn't in the baseline lineup, so the upgrade earns a new deck instead of affecting an existing one.
        Assert.Empty(suggestion.AffectedDeckIndexes);
    }

    [Fact]
    public void ReportsTheCheapestLevelJump_WhenOneLevelChangesNothing()
    {
        // Same X/Y overlap as above; card 9 is three levels short. One level (S=1.1⁻²) still scores
        // ≈0.579, below X's 0.58; only two levels (S=1.1⁻¹, ≈0.589) flip the pick, so that's the suggestion.
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
        // No competing deck to promote, so only the one-level suggestion appears, never a deeper jump.
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
        // Everything maxed; the ×0.94 missing-special penalty is the only headroom left.
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
        Assert.Equal(advice.BaselineScore * (1 / 0.94 - 1), suggestion.ScoreDelta, 10);
        Assert.False(suggestion.ChangesLineup);
        Assert.Equal([0], suggestion.AffectedDeckIndexes);
        // Levels are all maxed, but a locked fielded evo still means NOT collection-maxed.
        Assert.False(advice.CollectionMaxed);
    }

    [Fact]
    public void SuggestsAHeroUnlock_WhenOnlyTheEvoIsOwned()
    {
        // Card 2 already owns its Evo; only the still-locked Hero is suggested, not a re-unlock.
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
        // Card 99 is underleveled but outside every meta deck, so it doesn't block CollectionMaxed.
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
        // Card 9's deck still loses to the incumbent even maxed: no suggestion, but the collection isn't maxed either.
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
        // Champions are a rarity tier, not an evolution: there's nothing to unlock.
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
