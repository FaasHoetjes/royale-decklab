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
        Assert.Single(result.Alternatives); // 5 fieldable minus 4 picked
    }

    [Fact]
    public void SkipsTheStrongestDeck_WhenItBlocksABetterTotal()
    {
        // The 0.60 deck holds cards 1 AND 2, each of which one of the 0.58 decks
        // needs. Greedy grabs it and settles for fillers (0.60 + 3×0.50); the
        // exact search fields both 0.58s instead (2×0.58 + 2×0.50 = better).
        var cards = Build.Collection(Enumerable.Range(1, 46).ToArray());
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), confidence: 0.60),
            Build.Deck([1, 9, 10, 11, 12, 13, 14, 15], confidence: 0.58),
            Build.Deck([2, 16, 17, 18, 19, 20, 21, 22], confidence: 0.58),
            Build.Deck(Build.Eight(23), confidence: 0.50),
            Build.Deck(Build.Eight(31), confidence: 0.50),
            Build.Deck(Build.Eight(39), confidence: 0.50),
        };

        var result = Run(cards, meta);

        Assert.Equal(4, result.Decks.Count);
        Assert.DoesNotContain(result.Decks, d => d.CardIds.SequenceEqual(Build.Eight(1)));
        // Maxed cards and equal adoption, so scores are confidence × the shared
        // popularity factor (20 players, prior 8).
        Assert.Equal((0.58 + 0.58 + 0.50 + 0.50) * (20.0 / 28.0), result.TotalScore, 10);
    }

    [Fact]
    public void PrefersMoreDecks_OverOneStrongerDeck()
    {
        // The 0.90 deck overlaps both 0.20 decks, which are disjoint from each
        // other. A war wants slots filled: two decks beat one, whatever the scores.
        var cards = Build.Collection(Enumerable.Range(1, 22).ToArray());
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), confidence: 0.90),
            Build.Deck([1, 9, 10, 11, 12, 13, 14, 15], confidence: 0.20),
            Build.Deck([2, 16, 17, 18, 19, 20, 21, 22], confidence: 0.20),
        };

        var result = Run(cards, meta);

        Assert.Equal(2, result.Decks.Count);
        Assert.DoesNotContain(result.Decks, d => d.CardIds.SequenceEqual(Build.Eight(1)));
    }

    [Fact]
    public void MatchesExhaustiveSearch_OnADenselyOverlappingPool()
    {
        // 14 random decks over 30 cards force heavy overlap; brute-force every
        // disjoint lineup of up to four and check the search finds the optimum
        // (most decks first, then highest total).
        var rng = new Random(42);
        var cards = Build.Collection(Enumerable.Range(1, 30).ToArray());
        var cardMap = Build.CardMap(cards);
        var meta = Enumerable.Range(0, 14)
            .Select(d => Build.Deck(
                Enumerable.Range(1, 30).OrderBy(_ => rng.Next()).Take(8).ToArray(),
                confidence: 0.40 + 0.02 * d))
            .ToList();

        var fieldable = _analyzer.ScoreFieldableDecks(meta, cardMap);
        var result = _analyzer.SelectLineup(fieldable, cardMap, includeAlternatives: false);

        var bestCount = 0;
        var bestScore = 0.0;
        void Extend(int start, int picked, HashSet<int> used, double score)
        {
            if (picked > bestCount || (picked == bestCount && score > bestScore))
            {
                bestCount = picked;
                bestScore = score;
            }
            if (picked == 4)
            {
                return;
            }
            for (var i = start; i < fieldable.Count; i++)
            {
                var (deck, deckScore) = fieldable[i];
                if (deck.CardIds.Any(used.Contains))
                {
                    continue;
                }
                foreach (var id in deck.CardIds)
                {
                    used.Add(id);
                }
                Extend(i + 1, picked + 1, used, score + deckScore);
                foreach (var id in deck.CardIds)
                {
                    used.Remove(id);
                }
            }
        }
        Extend(0, 0, [], 0);

        Assert.Equal(bestCount, result.Decks.Count);
        Assert.Equal(bestScore, result.TotalScore, 10);
    }

    [Fact]
    public void HandlesAMetaSizedPool()
    {
        // A pool the size of a real meta: 1500 random decks over the full card
        // roster, with near-tied scores, the worst case for the exact search's
        // pruning. Must still produce four disjoint decks (and finish promptly).
        var rng = new Random(7);
        var cards = Build.Collection(Enumerable.Range(1, 110).ToArray());
        var meta = Enumerable.Range(0, 1500)
            .Select(_ => Build.Deck(
                Enumerable.Range(1, 110).OrderBy(_ => rng.Next()).Take(8).ToArray(),
                confidence: 0.40 + 0.15 * rng.NextDouble(),
                players: 5 + rng.Next(200)))
            .ToList();

        var result = Run(cards, meta);

        Assert.Equal(4, result.Decks.Count);
        Assert.Equal(32, result.Decks.SelectMany(d => d.CardIds).Distinct().Count());
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
    public void UpgradesAMetaNormalCard_ToAnOwnedHero_WhenTheHeroSlotIsFree()
    {
        // The meta deck fields two evos and no hero; the player owns card 1's hero
        // (evolutionLevel 2). In game the hero slot is positional, so fielding
        // card 1 there is a free upgrade, the personalised view must show it.
        var cards = new List<PlayerItemLevel> { Build.Card(1, evo: 2) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var versions = new List<CardVersion> { new(2, CardVersionKind.Evo), new(3, CardVersionKind.Evo) };
        var meta = new[] { Build.Deck(Build.Eight(1), versions: versions) };

        var deck = Assert.Single(Run(cards, meta).Decks);

        Assert.Equal(CardVersionKind.Normal, deck.MetaCardVersions!.Single(v => v.CardId == 1).Version);
        Assert.Equal(CardVersionKind.Hero, deck.CardVersions!.Single(v => v.CardId == 1).Version);
    }

    [Fact]
    public void UpgradesAMetaNormalCard_ToAnOwnedEvo_WhenAnEvoSlotIsFree()
    {
        var cards = new List<PlayerItemLevel> { Build.Card(1, evo: 1) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var meta = new[] { Build.Deck(Build.Eight(1)) }; // all-normal meta deck

        var deck = Assert.Single(Run(cards, meta).Decks);

        Assert.Equal(CardVersionKind.Evo, deck.CardVersions!.Single(v => v.CardId == 1).Version);
    }

    [Fact]
    public void NeverUpgrades_WhenTheMetaSpecialsAlreadyFillTheSlots()
    {
        // Three meta specials use all slot capacity: even unowned ones keep
        // their slots on screen, so the owned hero of card 1 has nowhere to go.
        var cards = new List<PlayerItemLevel> { Build.Card(1, evo: 2) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var versions = new List<CardVersion>
        {
            new(2, CardVersionKind.Evo), new(3, CardVersionKind.Evo), new(4, CardVersionKind.Hero),
        };
        var meta = new[] { Build.Deck(Build.Eight(1), versions: versions) };

        var deck = Assert.Single(Run(cards, meta).Decks);

        Assert.Equal(CardVersionKind.Normal, deck.CardVersions!.Single(v => v.CardId == 1).Version);
    }

    [Fact]
    public void AHeroOwner_NeverClaimsAnEvoSlot()
    {
        // Both hero slots are taken; evo slots are free. evolutionLevel 2 proves
        // the hero but leaves evo ownership ambiguous, so no evo is claimed.
        var cards = new List<PlayerItemLevel> { Build.Card(1, evo: 2) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var versions = new List<CardVersion> { new(2, CardVersionKind.Hero), new(3, CardVersionKind.Hero) };
        var meta = new[] { Build.Deck(Build.Eight(1), versions: versions) };

        var deck = Assert.Single(Run(cards, meta).Decks);

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
