namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrPlayerCard(
    int Id,
    string? Name,
    int Level,
    int MaxLevel,
    int? EvolutionLevel,
    int? ElixirCost,
    int? Count,
    string? Rarity,
    int? StarLevel,
    int? MaxEvolutionLevel,
    CardIconUrls? IconUrls);
