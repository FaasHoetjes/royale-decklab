using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Models;

public enum ClanJoinType
{
    Open,
    InviteOnly,
    Closed,
}

/// <summary>A clan in name search results, with what tells clans of the same name apart.</summary>
public sealed record ClanSummary(
    string Tag,
    string Name,
    int? BadgeId,
    int Members,
    int WarTrophies,
    string? Location,
    ClanJoinType JoinType)
{
    public const int MinNameLength = 3;

    /// <summary>Strongest war clan first: the clan someone is looking for is usually the active one.</summary>
    public static IReadOnlyList<ClanSummary> ListFrom(IEnumerable<CrClanSummary> found) => found
        .Where(c => !string.IsNullOrEmpty(c.Tag))
        .Select(c => new ClanSummary(
            c.Tag!,
            c.Name ?? c.Tag!,
            c.BadgeId,
            c.Members,
            c.ClanWarTrophies,
            c.Location?.Name,
            ParseJoinType(c.Type)))
        .OrderByDescending(c => c.WarTrophies)
        .ThenByDescending(c => c.Members)
        .ToList();

    private static ClanJoinType ParseJoinType(string? type) => type switch
    {
        "inviteOnly" => ClanJoinType.InviteOnly,
        "closed" => ClanJoinType.Closed,
        _ => ClanJoinType.Open,
    };
}
