namespace RoyaleDeckLab.Api.Dtos;

/// <summary>A card as it appears in a battle log entry. EvolutionLevel / Rarity classify the fielded version.</summary>
public sealed record CrBattleCard(int Id, int? EvolutionLevel, string? Rarity);
