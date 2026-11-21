using System.Globalization;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

public static class LadderDeck
{
    public static string Key(IReadOnlyList<CrownSeriesCard> cards)
        => string.Join(',', cards.Select(card => card.Version switch
        {
            CardVersionKind.Evo => $"{card.Id}e",
            CardVersionKind.Hero => $"{card.Id}h",
            _ => card.Id.ToString(),
        }));

    public static byte[] Levels(IReadOnlyList<CrownSeriesCard> cards) => cards.Select(card => (byte)card.Level).ToArray();

    /// <summary>The cards of a <see cref="Key"/>, in its order.</summary>
    public static (int[] CardIds, CardVersion[] Versions) Parse(string key)
    {
        var parts = key.Split(',');
        var ids = new int[parts.Length];
        var versions = new CardVersion[parts.Length];
        for (var i = 0; i < parts.Length; i++)
        {
            var part = parts[i];
            var version = part[^1] switch
            {
                'e' => CardVersionKind.Evo,
                'h' => CardVersionKind.Hero,
                _ => CardVersionKind.Normal,
            };
            ids[i] = int.Parse(version == CardVersionKind.Normal ? part : part[..^1], CultureInfo.InvariantCulture);
            versions[i] = new CardVersion(ids[i], version);
        }
        return (ids, versions);
    }
}
