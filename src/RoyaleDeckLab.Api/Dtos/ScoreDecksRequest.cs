namespace RoyaleDeckLab.Api.Dtos;

public sealed record ScoreDecksRequest(
    List<ScoreDeckCard>? Cards,
    List<List<int?>>? Decks,
    bool Maxed = false);
