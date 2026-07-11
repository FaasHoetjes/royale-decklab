using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Models;

public sealed record PlayerItemLevel
{
    public required int Id { get; init; }
    public string? Name { get; init; }
    public required int Level { get; init; }
    public required int MaxLevel { get; init; }
    public int EvolutionLevel { get; init; }
    public int? ElixirCost { get; init; }
    public Rarity Rarity { get; init; }
    public CardIconUrls? IconUrls { get; init; }
}

public static class PlayerItemLevelMapping
{
    public static PlayerItemLevel ToPlayerItemLevel(this CrPlayerCard c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        Level = c.Level,
        MaxLevel = c.MaxLevel,
        EvolutionLevel = c.EvolutionLevel ?? 0,
        ElixirCost = c.ElixirCost,
        Rarity = RarityExtensions.ParseRarity(c.Rarity),
        IconUrls = c.IconUrls,
    };
}
