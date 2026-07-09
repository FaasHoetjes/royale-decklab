namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// The only rarity the scoring logic branches on is <see cref="Champion"/>
/// (champions live in the hero slot and have no normal version; see DeckAnalyzer).
/// </summary>
public enum Rarity
{
    Common,
    Rare,
    Epic,
    Legendary,
    Champion,
}

public static class RarityExtensions
{
    public static Rarity ParseRarity(string? value) => value?.ToLowerInvariant() switch
    {
        "champion" => Rarity.Champion,
        "legendary" => Rarity.Legendary,
        "epic" => Rarity.Epic,
        "rare" => Rarity.Rare,
        _ => Rarity.Common,
    };
}
