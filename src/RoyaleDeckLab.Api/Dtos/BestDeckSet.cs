namespace RoyaleDeckLab.Api.Dtos;

public sealed record BestDeckSet(
    IReadOnlyList<BestDeckEntry> Decks,
    double TotalScore);
