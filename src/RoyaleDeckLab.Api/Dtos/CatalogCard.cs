namespace RoyaleDeckLab.Api.Dtos;

/// <summary>A card as the catalog (/cards) returns it. Passed through to the client verbatim.</summary>
public sealed record CatalogCard(
    int Id,
    string Name,
    int MaxLevel,
    int? MaxEvolutionLevel,
    int? ElixirCost,
    string? Rarity,
    CardIconUrls? IconUrls);
