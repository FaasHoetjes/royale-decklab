namespace RoyaleDeckLab.Api.Dtos;

/// <summary>A card in a player's collection (level/evo info drives fieldability scoring in slice 2).</summary>
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
