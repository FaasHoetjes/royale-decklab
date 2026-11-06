namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// Week is 1-based within the season. Medals add up what the members earned: the log's own clan fame is the boat's
/// distance on river weeks (10,000 at the finish) and only matches the medals on colosseum weeks.
/// </summary>
public sealed record PastWarWeek(
    int SeasonId,
    int Week,
    int Rank,
    int Medals,
    DateTimeOffset? EndedAt);
