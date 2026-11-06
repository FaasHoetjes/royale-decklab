namespace RoyaleDeckLab.Api.Dtos;

public sealed record ClanMember(
    string? Tag,
    string? Name,
    string? Role,
    string? LastSeen);
