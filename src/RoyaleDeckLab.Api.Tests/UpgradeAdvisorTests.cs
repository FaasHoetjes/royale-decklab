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
    public void StaysFast_WithAMetaSizedPool_AndAFullyUpgradeableCollection()
    {
        // The advisor re-runs the exact lineup search once per upgradeable card —
        // here ~110 searches over 1500 near-tied decks, the worst realistic load.
        // The generous ceiling only catches pathological regressions.
        var rng = new Random(7);
        var cards = Enumerable.Range(1, 110).Select(id => Build.Card(id, level: 13)).ToList();
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
}
