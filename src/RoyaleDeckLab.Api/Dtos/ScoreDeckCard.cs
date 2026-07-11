namespace RoyaleDeckLab.Api.Dtos;

public sealed record ScoreDeckCard(
    int Id,
    int Level,
    int MaxLevel,
    int EvolutionLevel,
    string? Rarity);
