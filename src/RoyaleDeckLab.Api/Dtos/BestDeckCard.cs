namespace RoyaleDeckLab.Api.Dtos;

public sealed record BestDeckCard(
    int Id,
    string Name,
    int MaxLevel,
    int? ElixirCost,
    string? Rarity,
    CardIconUrls? IconUrls);
