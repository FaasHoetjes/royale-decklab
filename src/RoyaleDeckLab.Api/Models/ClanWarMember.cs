namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// DecksUsedPastWeeks and FamePastWeeks line up with <see cref="ClanWar.PastWeeks"/>; null means the member wasn't
/// in the clan that week.
/// </summary>
public sealed record ClanWarMember(
    string Tag,
    string Name,
    ClanRole Role,
    DateTimeOffset? LastSeen,
    int DecksUsedToday,
    int DecksLeftToday,
    int DecksUsedThisWeek,
    int Fame,
    IReadOnlyList<int?> DecksUsedPastWeeks,
    IReadOnlyList<int?> FamePastWeeks);
