namespace RoyaleDeckLab.Api.Models;

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
