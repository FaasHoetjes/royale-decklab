using System.Text.Json;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

/// <summary>Stores a round's cards as [id, level, version] arrays: the table gains about 90k rows every Duel weekend.</summary>
public static class CrownSeriesCardStorage
{
    public static string Serialize(IReadOnlyList<CrownSeriesCard> cards)
        => JsonSerializer.Serialize(cards.Select(c => new[] { c.Id, c.Level, (int)c.Version }));

    public static IReadOnlyList<CrownSeriesCard> Deserialize(string json)
    {
        var rows = JsonSerializer.Deserialize<int[][]>(json) ?? [];
        return rows
            .Select(r => new CrownSeriesCard(r[0], r[1], (CardVersionKind)r[2]))
            .ToList();
    }
}
