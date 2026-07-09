using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Dtos;

public sealed record BestDeckEntry(
    int[] CardIds,
    double WinRate,
    double Confidence,
    int Uses,
    int Players,
    double PickRate,
    double MetaScore,
    IReadOnlyList<CardVersion> CardVersions,
    IReadOnlyList<BestDeckCard> Cards);
