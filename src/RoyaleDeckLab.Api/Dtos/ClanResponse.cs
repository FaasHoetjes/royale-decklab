namespace RoyaleDeckLab.Api.Dtos;

/// <summary>The /clans/{tag} response; only the member list is read.</summary>
public sealed record ClanResponse(List<ClanMember>? MemberList);
