namespace RoyaleDeckLab.Api.Dtos;

/// <summary>A set of four card-disjoint meta decks, ranked by combined score.</summary>
public sealed record BestDeckSet(
    IReadOnlyList<BestDeckEntry> Decks,
    double TotalScore);
