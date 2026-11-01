using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// The `?share=` lineup from client/src/lib/shareLink.ts: each card as two base-36 characters, decks joined
/// by dots, cards in the order the sharer saw them.
/// </summary>
public static class ShareCode
{
    private const int PerType = 432;
    private const int FirstType = 26;
    private const int Types = 3;

    public static bool TryDecode(string? raw, out IReadOnlyList<int[]> decks)
    {
        decks = [];
        if (string.IsNullOrEmpty(raw))
        {
            return false;
        }
        var parts = raw.Split('.');
        if (parts.Length > LineupOptions.MaxDecks)
        {
            return false;
        }

        var seen = new HashSet<int>();
        var result = new List<int[]>(parts.Length);
        foreach (var part in parts)
        {
            if (part.Length != LineupOptions.CardsPerDeck * 2)
            {
                return false;
            }
            var deck = new int[LineupOptions.CardsPerDeck];
            for (var i = 0; i < deck.Length; i++)
            {
                if (Digit(part[i * 2]) is not { } high || Digit(part[i * 2 + 1]) is not { } low)
                {
                    return false;
                }
                var k = high * 36 + low;
                if (k >= Types * PerType)
                {
                    return false;
                }
                var id = (FirstType + k / PerType) * 1_000_000 + k % PerType;
                if (!seen.Add(id))
                {
                    return false;
                }
                deck[i] = id;
            }
            result.Add(deck);
        }
        decks = result;
        return true;
    }

    private static int? Digit(char c) => c switch
    {
        >= '0' and <= '9' => c - '0',
        >= 'a' and <= 'z' => c - 'a' + 10,
        _ => null,
    };
}
