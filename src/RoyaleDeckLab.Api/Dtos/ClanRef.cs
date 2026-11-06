namespace RoyaleDeckLab.Api.Dtos;

public sealed record ClanRef(
    string? Tag,
    string? Name,
    int? BadgeId = null);
