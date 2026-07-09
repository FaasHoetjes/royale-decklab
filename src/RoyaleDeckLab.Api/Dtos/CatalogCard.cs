namespace RoyaleDeckLab.Api.Dtos;

public sealed record CatalogCard(
    int Id,
    string Name,
    int MaxLevel,
    int? MaxEvolutionLevel,
    int? ElixirCost,
    string? Rarity,
    CardIconUrls? IconUrls);
