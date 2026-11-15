namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// The cards Clash Royale raises to each player's King Tower level for the season, the same cards for everyone and
/// in every battle, war included.
/// </summary>
public sealed record SeasonBoosts(IReadOnlySet<int> CardIds)
{
    public const int MinKingTowerLevel = 7;

    public static SeasonBoosts None { get; } = new(new HashSet<int>());

    /// <summary>The boosted cards the player owns below their King Tower level: the ones a boost raises.</summary>
    public PlayerSeasonBoosts For(IReadOnlyDictionary<int, PlayerItemLevel> cards, int kingTowerLevel)
    {
        if (kingTowerLevel < MinKingTowerLevel)
        {
            return new PlayerSeasonBoosts(kingTowerLevel, []);
        }

        var raised = CardIds
            .Where(id => cards.TryGetValue(id, out var card) && LevelModel.DisplayLevel(card) < kingTowerLevel)
            .Order()
            .ToList();
        return new PlayerSeasonBoosts(kingTowerLevel, raised);
    }
}

/// <param name="Level">The display level the boosted cards play at: the player's King Tower level.</param>
public sealed record PlayerSeasonBoosts(int Level, IReadOnlyList<int> CardIds)
{
    public Dictionary<int, PlayerItemLevel> ApplyTo(IReadOnlyDictionary<int, PlayerItemLevel> cards)
    {
        var boosted = new Dictionary<int, PlayerItemLevel>(cards);
        foreach (var id in CardIds)
        {
            boosted[id] = cards[id].BoostedTo(Level);
        }
        return boosted;
    }
}
