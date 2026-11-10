using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Dtos;

public sealed record ClanRef(
    string? Tag,
    string? Name,
    int? BadgeId = null)
{
    public ClanRef WithDisplayName() => Name is null ? this : this with { Name = DisplayName.Clean(Name, Tag ?? "") };
}
