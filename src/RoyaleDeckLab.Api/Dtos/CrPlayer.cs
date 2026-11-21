using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrPlayer(
    string Tag,
    string Name,
    List<CrPlayerCard>? Cards,
    ClanRef? Clan,
    int KingTowerLevel,
    int Trophies = 0,
    CrRankedSeason? CurrentPathOfLegendSeasonResult = null,
    CrRankedSeason? LastPathOfLegendSeasonResult = null)
{
    public CrPlayer WithDisplayNames() => this with { Name = DisplayName.Clean(Name, Tag), Clan = Clan?.WithDisplayName() };
}

public sealed record CrRankedSeason(int LeagueNumber);
