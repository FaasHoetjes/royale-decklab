using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record WarDeckPlayed(
    IReadOnlyList<int> CardIds,
    IReadOnlyList<CardVersion> CardVersions);

/// <summary>
/// The war decks a player has used today. The river race says how many; the battle log, newest first, says which.
/// A duel plays one deck per round, so it can hold two or three of them.
/// </summary>
public sealed record WarDecksToday(
    int DecksUsed,
    IReadOnlyList<WarDeckPlayed> Decks)
{
    public static WarDecksToday None { get; } = new(0, []);

    private static readonly HashSet<string> WarBattleTypes = new(StringComparer.Ordinal)
    {
        "riverRacePvP",
        "riverRaceDuel",
        "riverRaceDuelColosseum",
        "boatBattle",
    };

    public static WarDecksToday From(int decksUsed, IReadOnlyList<CrBattle> battleLog)
    {
        var decks = new List<WarDeckPlayed>(decksUsed);
        foreach (var battle in battleLog)
        {
            if (decks.Count >= decksUsed)
            {
                break;
            }
            if (!WarBattleTypes.Contains(battle.Type))
            {
                continue;
            }
            if (battle.Team?.FirstOrDefault() is not { } side)
            {
                continue;
            }

            var newestFirst = DecksOf(side).Take(decksUsed - decks.Count);
            decks.AddRange(newestFirst.Select(ToDeck));
        }
        return new WarDecksToday(decksUsed, decks);
    }

    private static IEnumerable<List<CrBattleCard>> DecksOf(CrBattleSide side)
    {
        if (side.Rounds is { Count: > 0 } rounds)
        {
            return rounds
                .AsEnumerable()
                .Reverse()
                .Select(r => r.Cards ?? [])
                .Where(cards => cards.Count > 0);
        }
        if (side.Cards is { Count: > 0 } cards)
        {
            return [cards];
        }
        return [];
    }

    private static WarDeckPlayed ToDeck(List<CrBattleCard> cards) => new(
        cards.Select(c => c.Id).ToList(),
        cards.Select(c => new CardVersion(c.Id, MetaBuilder.FieldedVersion(c))).ToList());
}
