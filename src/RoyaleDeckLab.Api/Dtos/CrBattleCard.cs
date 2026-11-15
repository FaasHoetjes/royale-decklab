namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrBattleCard(
    int Id,
    int? EvolutionLevel,
    string? Rarity,
    int? Level = null,
    int? MaxLevel = null);
