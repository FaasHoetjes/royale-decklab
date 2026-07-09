namespace RoyaleDeckLab.Api.Dtos;

/// <summary>Each deck is a list of card ids with nulls for empty slots.</summary>
public sealed record ScoreDecksRequest(
    List<ScoreDeckCard>? Cards,
    List<List<int?>>? Decks);
