namespace RoyaleDeckLab.Api.Dtos;

/// <summary>
/// A placed card as the War Deck Builder posts it: enough to score fieldability
/// and detect owned specials. Name/elixir/icons aren't sent; the builder only
/// needs a number back.
/// </summary>
public sealed record ScoreDeckCard(
    int Id,
    int Level,
    int MaxLevel,
    int EvolutionLevel,
    string? Rarity);
