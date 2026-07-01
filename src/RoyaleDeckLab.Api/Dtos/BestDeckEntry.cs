using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Dtos;

/// <summary>One deck within a Best War Decks set: meta stats + display cards + versions.</summary>
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
