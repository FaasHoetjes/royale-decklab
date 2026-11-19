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
}
