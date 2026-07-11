namespace RoyaleDeckLab.Api.Dtos;

public sealed record BuilderDeckScore(
    double? Score,
    bool IsMeta,
    double? WinRate,
    double? Fieldability,
    int? Players);
