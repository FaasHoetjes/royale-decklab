namespace RoyaleDeckLab.Api.Dtos;

/// <summary>A catalog card trimmed to what the Best War Decks grid renders.</summary>
public sealed record BestDeckCard(
    int Id,
    string Name,
    int MaxLevel,
    int? ElixirCost,
    string? Rarity,
    CardIconUrls? IconUrls);
