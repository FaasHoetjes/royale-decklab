namespace RoyaleDeckLab.Api.Dtos;

/// <summary>Always four card-disjoint decks.</summary>
public sealed record BestDeckSet(
    IReadOnlyList<BestDeckEntry> Decks,
    double TotalScore);
