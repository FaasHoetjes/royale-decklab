using System.Text.Json;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ScoreLockedDecksTests
{
    [Fact]
    public void DirectScoringMatchesGeneratorLocks_IncludingVersionsAndUnprovenDecks()
    {
        var cards = Enumerable.Range(1, 32).Select(id => Build.Card(id, level: 10 + id % 5,
            evo: id % 4, rarity: id == 3 ? Rarity.Champion : Rarity.Common)).ToList();
        var map = Build.CardMap(cards);
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), versions: [new(1, CardVersionKind.Evo), new(2, CardVersionKind.Hero), new(3, CardVersionKind.Hero)]),
            Build.Deck(Build.Eight(9), versions: [new(9, CardVersionKind.Hero)]),
            Build.Deck(Build.Eight(25)),
        };
        var index = meta.ToDictionary(d => MetaCache.DeckKey(d.CardIds));
        int[][] shared = [Build.Eight(9).Reverse().ToArray(), Build.Eight(17), Build.Eight(1)];
        var analyzer = new DeckAnalyzer();
        var generated = analyzer.FindBestWarDecks(meta, map, new LineupOptions
        {
            DeckCount = 3,
            LockedDecks = [.. shared.Select(ids => ids.Order().ToArray())],
        });

        var direct = analyzer.ScoreLockedDecks(index, map, shared);

        Assert.Equal(3, direct.Count);
        Assert.Equal(JsonSerializer.Serialize(generated.Decks), JsonSerializer.Serialize(direct));
        Assert.Equal(0, direct[1].Uses);
    }

    [Fact]
    public void DirectScoringSkipsUnownedDecks_WithoutGeneratingReplacements()
    {
        var map = Build.CardMap(Build.Collection(Enumerable.Range(1, 32).ToArray()));
        var meta = new[] { Build.Deck(Build.Eight(1)), Build.Deck(Build.Eight(9)) };
        var index = meta.ToDictionary(d => MetaCache.DeckKey(d.CardIds));

        var direct = new DeckAnalyzer().ScoreLockedDecks(index, map, [Build.Eight(1), Build.Eight(33)]);

        Assert.Equal(Build.Eight(1), Assert.Single(direct).CardIds);
    }
}
