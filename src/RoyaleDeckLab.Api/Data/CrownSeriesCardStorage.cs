using System.Collections.Concurrent;
using System.Text.Json;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

/// <summary>Stores a round's cards as [id, level, version] arrays: the table gains about 90k rows every Duel weekend.</summary>
public static class CrownSeriesCardStorage
{
    // Reading every round holds millions of cards but only a few thousand distinct ones, so each is shared.
    private static readonly ConcurrentDictionary<(int Id, int Level, int Version), CrownSeriesCard> Shared = new();

    public static string Serialize(IReadOnlyList<CrownSeriesCard> cards)
        => JsonSerializer.Serialize(cards.Select(c => new[] { c.Id, c.Level, (int)c.Version }));

    public static IReadOnlyList<CrownSeriesCard> Deserialize(string json)
    {
        var rows = JsonSerializer.Deserialize<int[][]>(json) ?? [];
        return rows
            .Select(r => Shared.GetOrAdd((r[0], r[1], r[2]), k => new CrownSeriesCard(k.Id, k.Level, (CardVersionKind)k.Version)))
            .ToList();
    }
}
