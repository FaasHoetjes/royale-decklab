namespace RoyaleDeckLab.Api.Dtos;

/// <summary>
/// One deck's score in the War Deck Builder response. <see cref="Score"/> is null
/// when the deck is empty or a card isn't in the player's collection; the win-rate
/// / fieldability / players fields are present only for a scorable deck.
/// </summary>
public sealed record BuilderDeckScore(
    double? Score,
    bool IsMeta,
    double? WinRate,
    double? Fieldability,
    int? Players);
