namespace RoyaleDeckLab.Api.Dtos;

public sealed record ClanResponse(
    string? Tag,
    string? Name,
    List<ClanMember>? MemberList,
    int? BadgeId = null);
