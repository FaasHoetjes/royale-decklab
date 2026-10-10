using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class GeneratorOptionsTests
{
    private readonly DeckAnalyzer _analyzer = new();

    // Five disjoint decks with distinct strengths, over cards 1..40, all maxed.
    private static readonly List<DeckMeta> FiveDecks =
    [
        Build.Deck(Build.Eight(1), confidence: 0.60),
        Build.Deck(Build.Eight(9), confidence: 0.58),
        Build.Deck(Build.Eight(17), confidence: 0.56),
        Build.Deck(Build.Eight(25), confidence: 0.54),
        Build.Deck(Build.Eight(33), confidence: 0.52),
    ];

    private WarDeckResult Run(IReadOnlyList<DeckMeta> meta, LineupOptions? options, IReadOnlyList<PlayerItemLevel>? cards = null)
        => _analyzer.FindBestWarDecks(meta, Build.CardMap(cards ?? Build.Collection(Enumerable.Range(1, 48).ToArray())), options);

    private static int[] Starts(WarDeckResult result) => result.Decks.Select(d => d.CardIds.Min()).ToArray();

    [Fact]
    public void DefaultOptions_GiveExactlyTheUnconstrainedResult()
    {
        var plain = _analyzer.FindBestWarDecks(FiveDecks, Build.CardMap(Build.Collection(Enumerable.Range(1, 48).ToArray())));
        var withDefaults = Run(FiveDecks, LineupOptions.Default);

        Assert.Equal(plain.Decks.Select(d => d.CardIds), withDefaults.Decks.Select(d => d.CardIds));
        Assert.Equal(plain.Alternatives.Select(d => d.CardIds), withDefaults.Alternatives.Select(d => d.CardIds));
        Assert.Equal(plain.TotalScore, withDefaults.TotalScore, 12);
    }

    [Fact]
    public void DeckCount_ReturnsOnlyThatManyDecks_TheStrongestOnes()
    {
        var result = Run(FiveDecks, new LineupOptions { DeckCount = 2 });

        Assert.Equal([1, 9], Starts(result));
        Assert.Equal(result.Decks.Sum(d => d.PlayerScore), result.TotalScore, 12);
    }

    [Fact]
    public void MinLevel_DropsEveryDeckWithACardBelowIt()
    {
        // Card 3 is level 11 in-game (9 of max 14): the strongest deck goes, from the lineup and the alternatives.
        var cards = Build.Collection(Enumerable.Range(1, 48).Where(id => id != 3).ToArray());
        cards.Add(Build.Card(3, level: 9, maxLevel: 14));

        var result = Run(FiveDecks, new LineupOptions { MinLevel = 12 }, cards);

        Assert.Equal([9, 17, 25, 33], Starts(result));
        Assert.DoesNotContain(result.Alternatives, d => d.CardIds.Contains(3));
    }

    [Fact]
    public void MinLevel_KeepsDecksAtExactlyThatLevel()
    {
        var cards = Build.Collection(Enumerable.Range(1, 48).Where(id => id != 3).ToArray());
        cards.Add(Build.Card(3, level: 10, maxLevel: 14)); // in-game level 12

        var result = Run(FiveDecks, new LineupOptions { MinLevel = 12 }, cards);

        // Still a candidate (the level model may bench it, but the filter must not remove it).
        Assert.Contains(result.Decks.Concat(result.Alternatives), d => d.CardIds.Contains(3));
    }

    [Fact]
    public void BannedCard_KeepsItsDecksOutOfTheLineupAndAlternatives()
    {
        var result = Run(FiveDecks, new LineupOptions { BannedCards = new HashSet<int> { 12 } });

        Assert.Equal([1, 17, 25, 33], Starts(result));
        Assert.DoesNotContain(result.Alternatives, d => d.CardIds.Contains(12));
    }

    [Fact]
    public void RequiredCard_PullsInADeckThatWouldOtherwiseBeBenched()
    {
        // Card 40 only appears in the weakest deck, which the best 2-deck lineup skips.
        var result = Run(FiveDecks, new LineupOptions { DeckCount = 2, RequiredCards = new HashSet<int> { 40 } });

        Assert.Equal([1, 33], Starts(result));
    }

    [Fact]
    public void RequiredCard_ThatNoDeckCanUse_GivesNoLineup()
    {
        var result = Run(FiveDecks, new LineupOptions { RequiredCards = new HashSet<int> { 45 } });

        Assert.Empty(result.Decks);
        Assert.Equal(0, result.TotalScore);
    }

    [Fact]
    public void LockedDeck_IsKeptFirst_AndTheRestAreOptimizedAroundIt()
    {
        // Lock a weak deck that overlaps the two strongest: they can't be used next to it.
        var meta = FiveDecks.Append(Build.Deck([1, 9, 41, 42, 43, 44, 45, 46], confidence: 0.50)).ToList();
        var options = new LineupOptions { LockedDecks = [[1, 9, 41, 42, 43, 44, 45, 46]] };

        var result = Run(meta, options);

        Assert.Equal([1, 9, 41, 42, 43, 44, 45, 46], result.Decks[0].CardIds);
        Assert.Equal([1, 17, 25, 33], Starts(result));
        var allCards = result.Decks.SelectMany(d => d.CardIds).ToList();
        Assert.Equal(allCards.Count, allCards.Distinct().Count());
        Assert.Equal(result.Decks.Sum(d => d.PlayerScore), result.TotalScore, 12);
    }

    [Fact]
    public void LockedDeck_ThatIsNoLongerInTheMeta_GetsTheUnprovenEstimate()
    {
        int[] handBuilt = [41, 42, 43, 44, 45, 46, 47, 48];
        var cards = Build.Collection(Enumerable.Range(1, 48).ToArray());

        var result = Run(FiveDecks, new LineupOptions { LockedDecks = [handBuilt] }, cards);

        var expected = _analyzer.ScoreBuilderDeck(cards, handBuilt, meta: null)!.Score;
        Assert.Equal(handBuilt, result.Decks[0].CardIds);
        Assert.Equal(expected, result.Decks[0].PlayerScore, 12);
        Assert.Equal(4, result.Decks.Count);
    }

    [Fact]
    public void LockedDeck_WithACardThePlayerDoesNotOwn_IsSkipped()
    {
        var cards = Build.Collection(Enumerable.Range(1, 40).ToArray());

        var result = Run(FiveDecks, new LineupOptions { LockedDecks = [[41, 42, 43, 44, 45, 46, 47, 48]] }, cards);

        Assert.Equal([1, 9, 17, 25], Starts(result));
    }

    [Fact]
    public void RequiredCard_InsideALockedDeck_IsAlreadySatisfied()
    {
        var options = new LineupOptions
        {
            DeckCount = 2,
            RequiredCards = new HashSet<int> { 35 },
            LockedDecks = [Build.Eight(33)],
        };

        var result = Run(FiveDecks, options);

        Assert.Equal([33, 1], Starts(result));
    }

    [Fact]
    public void MatchesBruteForce_OnRandomOverlappingMetas()
    {
        // The search must find the best lineup (most decks, then highest total) among those that obey every option.
        var rng = new Random(20261009);
        for (var trial = 0; trial < 150; trial++)
        {
            var meta = Enumerable.Range(0, 9)
                .Select(_ => Build.Deck(
                    Enumerable.Range(1, 26).OrderBy(_ => rng.Next()).Take(8).Order().ToArray(),
                    confidence: 0.45 + rng.NextDouble() * 0.2))
                .GroupBy(d => string.Join(',', d.CardIds)).Select(g => g.First())
                .ToList();
            var cards = Build.Collection(Enumerable.Range(1, 26).ToArray());
            var options = new LineupOptions
            {
                DeckCount = rng.Next(1, 5),
                BannedCards = rng.Next(3) == 0 ? new HashSet<int> { rng.Next(1, 27) } : new HashSet<int>(),
                RequiredCards = Enumerable.Range(0, rng.Next(0, 3)).Select(_ => rng.Next(1, 27)).ToHashSet(),
            };
            options = options with { RequiredCards = options.RequiredCards.Except(options.BannedCards).ToHashSet() };

            var result = Run(meta, options, cards);
            var (bestCount, bestTotal) = BruteForce(meta, cards, options);

            Assert.True(bestCount == result.Decks.Count, $"trial {trial}: {result.Decks.Count} decks, brute force {bestCount}");
            Assert.True(Math.Abs(bestTotal - result.TotalScore) < 1e-9, $"trial {trial}: {result.TotalScore} vs {bestTotal}");
            var used = result.Decks.SelectMany(d => d.CardIds).ToList();
            Assert.Equal(used.Count, used.Distinct().Count());
            if (used.Count > 0)
            {
                Assert.All(options.RequiredCards, id => Assert.Contains(id, used));
            }
            Assert.DoesNotContain(used, options.BannedCards.Contains);
        }
    }

    private (int count, double total) BruteForce(
        IReadOnlyList<DeckMeta> meta, IReadOnlyList<PlayerItemLevel> cards, LineupOptions options)
    {
        var scored = _analyzer.ScoreFieldableDecks(meta, Build.CardMap(cards))
            .Where(s => !s.deck.CardIds.Any(options.BannedCards.Contains))
            .ToList();
        var bestCount = 0;
        var bestTotal = 0.0;
        for (var mask = 1; mask < 1 << scored.Count; mask++)
        {
            var picked = scored.Where((_, i) => (mask & (1 << i)) != 0).ToList();
            if (picked.Count > options.DeckCount)
            {
                continue;
            }
            var used = picked.SelectMany(p => p.deck.CardIds).ToList();
            if (used.Count != used.Distinct().Count() || !options.RequiredCards.All(used.Contains))
            {
                continue;
            }
            var total = picked.Sum(p => p.score);
            if (picked.Count > bestCount || (picked.Count == bestCount && total > bestTotal + 1e-12))
            {
                bestCount = picked.Count;
                bestTotal = total;
            }
        }
        return (bestCount, bestTotal);
    }
}
