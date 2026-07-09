namespace RoyaleDeckLab.Api.Dtos;

/// <summary><see cref="Score"/> is null when the deck is empty or a card isn't in the player's collection.</summary>
public sealed record BuilderDeckScore(
    double? Score,
    bool IsMeta,
    double? WinRate,
    double? Fieldability,
    int? Players);
