namespace RoyaleDeckLab.Api.Dtos;

/// <summary>Name/elixir/icons aren't sent; the builder only needs a number back.</summary>
public sealed record ScoreDeckCard(
    int Id,
    int Level,
    int MaxLevel,
    int EvolutionLevel,
    string? Rarity);
