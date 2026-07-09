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
        Assert.Equal(allCards.Count, allCards.Distinct().Count());
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
        Assert.Single(result.Alternatives);
    }

    [Fact]
    public void SkipsTheStrongestDeck_WhenItBlocksABetterTotal()
    {
        // Deck 0.60 blocks both 0.58 decks; greedy takes it, the exact search benches it for a better total.
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
        // Maxed, equal adoption: score is confidence × popularity factor (20 players, prior 8).
        Assert.Equal((0.58 + 0.58 + 0.50 + 0.50) * (20.0 / 28.0), result.TotalScore, 10);
    }

    [Fact]
    public void PrefersMoreDecks_OverOneStrongerDeck()
    {
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
        // 1500 near-tied decks over the full roster: the worst case for the exact search's pruning.
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
        // Strict floor (5 players) yields three decks; the ladder relaxes to admit the 2-player fourth.
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
        var cards = Build.Collection(Build.Eight(1));
        var meta = new List<DeckMeta>
        {
            Build.Deck(Build.Eight(1)),
            Build.Deck(Build.Eight(9)),
        };

        var result = Run(cards, meta);

        Assert.Single(result.Decks);
        Assert.True(result.Decks[0].CardIds.SequenceEqual(Build.Eight(1)));
    }

    [Fact]
    public void PersonalisesArtwork_ButKeepsTheMetaSlotVersion_ForAnUnownedEvo()
    {
        var cards = Build.Collection(Build.Eight(1));
        var versions = new List<CardVersion> { new(1, CardVersionKind.Evo) };
        var meta = new[] { Build.Deck(Build.Eight(1), versions: versions) };

        var deck = Assert.Single(Run(cards, meta).Decks);

        Assert.Equal(CardVersionKind.Evo, deck.MetaCardVersions!.Single(v => v.CardId == 1).Version);
        Assert.Equal(CardVersionKind.Normal, deck.CardVersions!.Single(v => v.CardId == 1).Version);
    }

    [Fact]
    public void UpgradesAMetaNormalCard_ToAnOwnedHero_WhenTheHeroSlotIsFree()
    {
        // The hero slot is positional: fielding the player's owned hero there is a free upgrade.
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
        var meta = new[] { Build.Deck(Build.Eight(1)) };

        var deck = Assert.Single(Run(cards, meta).Decks);

        Assert.Equal(CardVersionKind.Evo, deck.CardVersions!.Single(v => v.CardId == 1).Version);
    }

    [Fact]
    public void NeverUpgrades_WhenTheMetaSpecialsAlreadyFillTheSlots()
    {
        // Unowned specials still occupy their slots, so the owned hero has nowhere free to go.
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
        // Both hero slots are taken; evolutionLevel 2 proves the hero but leaves evo ownership ambiguous.
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
        // The battlelog can't flag champions, so reconciliation must force hero placement by identity.
        var cards = new List<PlayerItemLevel> { Build.Card(1, rarity: Rarity.Champion) }
            .Concat(Build.Collection(2, 3, 4, 5, 6, 7, 8)).ToList();
        var meta = new[] { Build.Deck(Build.Eight(1), versions: null) };

        var deck = Assert.Single(Run(cards, meta).Decks);

        Assert.Equal(CardVersionKind.Hero, deck.MetaCardVersions!.Single(v => v.CardId == 1).Version);
        Assert.Equal(CardVersionKind.Hero, deck.CardVersions!.Single(v => v.CardId == 1).Version);
    }
}
