namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// The four card-disjoint war decks recommended for a player, plus a ranked pool
/// of swap candidates. The alternatives are NOT mutually disjoint — the UI
/// resolves card conflicts at swap time.
/// </summary>
public sealed record WarDeckResult
{
    public required IReadOnlyList<ScoredDeck> Decks { get; init; }
    public required double TotalScore { get; init; }
    public required IReadOnlyList<ScoredDeck> Alternatives { get; init; }
}
