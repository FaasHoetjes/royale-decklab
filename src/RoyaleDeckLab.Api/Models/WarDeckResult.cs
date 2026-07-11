namespace RoyaleDeckLab.Api.Models;

public sealed record WarDeckResult
{
    public required IReadOnlyList<ScoredDeck> Decks { get; init; }
    public required double TotalScore { get; init; }
    public required IReadOnlyList<ScoredDeck> Alternatives { get; init; }
}
