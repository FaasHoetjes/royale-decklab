namespace RoyaleDeckLab.Api.Dtos;

/// <summary>
/// Body of POST /api/score-decks: the player's placed cards plus the four decks
/// they're building, each a list of card ids with nulls for empty slots.
/// </summary>
public sealed record ScoreDecksRequest(
    List<ScoreDeckCard>? Cards,
    List<List<int?>>? Decks);
