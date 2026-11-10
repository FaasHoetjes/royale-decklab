using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrPlayer(
    string Tag,
    string Name,
    List<CrPlayerCard>? Cards,
    ClanRef? Clan)
{
    public CrPlayer WithDisplayNames() => this with { Name = DisplayName.Clean(Name, Tag), Clan = Clan?.WithDisplayName() };
}
