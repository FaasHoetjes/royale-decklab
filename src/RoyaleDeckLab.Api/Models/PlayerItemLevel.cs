using System.Text.Json.Serialization;
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

    /// <summary>The player's own level when a season boost has raised <see cref="Level"/> for this season.</summary>
    public int? BoostedFromLevel { get; init; }

    /// <summary>The level the player has upgraded the card to, whatever a boost lends it for the season.</summary>
    [JsonIgnore]
    public int OwnedLevel => BoostedFromLevel ?? Level;

    public PlayerItemLevel BoostedTo(int displayLevel) => this with
    {
        Level = displayLevel - (LevelModel.MaxDisplayLevel - MaxLevel),
        BoostedFromLevel = OwnedLevel,
    };
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

    /// <summary>By card id. Should the CR API repeat a card, the last one wins instead of failing the request.</summary>
    public static Dictionary<int, PlayerItemLevel> ToCardMap(this IEnumerable<PlayerItemLevel> cards)
    {
        var map = new Dictionary<int, PlayerItemLevel>();
        foreach (var card in cards)
        {
            map[card.Id] = card;
        }
        return map;
    }
}
