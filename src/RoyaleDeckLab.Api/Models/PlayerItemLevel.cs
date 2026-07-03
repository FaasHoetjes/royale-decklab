using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// One card in a player's collection, as the scoring logic reasons about it and
/// as it's echoed back inside a <see cref="ScoredDeck"/>'s card list. Level and
/// evolution drive fieldability scoring; <see cref="Rarity"/> flags champions.
/// The remaining fields (name, elixir, icons) are display passthrough for the UI.
/// </summary>
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
