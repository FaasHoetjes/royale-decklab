namespace RoyaleDeckLab.Api.Models;

/// <summary>Week is 1-based within the season.</summary>
public sealed record PastWarWeek(
    int SeasonId,
    int Week,
    int Rank,
    int Fame,
    DateTimeOffset? EndedAt);
