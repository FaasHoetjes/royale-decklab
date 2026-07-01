namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// Card rarity. The only rarity the scoring logic actually branches on is
/// <see cref="Champion"/> (champions live in the hero slot and have no normal
/// version — see DeckAnalyzer), but the full set mirrors the game's rarities.
/// </summary>
public enum Rarity
{
    Common,
    Rare,
    Epic,
    Legendary,
    Champion,
}

/// <summary>Maps the CR API's lowercase rarity string onto <see cref="Rarity"/>.</summary>
public static class RarityExtensions
{
    /// <summary>Parses an API rarity string; anything unrecognised falls back to Common.</summary>
    public static Rarity ParseRarity(string? value) => value?.ToLowerInvariant() switch
    {
        "champion" => Rarity.Champion,
        "legendary" => Rarity.Legendary,
        "epic" => Rarity.Epic,
        "rare" => Rarity.Rare,
        _ => Rarity.Common,
    };
}
