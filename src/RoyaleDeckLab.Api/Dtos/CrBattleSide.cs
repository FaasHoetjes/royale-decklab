namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrBattleSide(
    string? Tag,
    string? Name,
    List<CrBattleCard>? Cards,
    int Crowns,
    List<CrBattleRound>? Rounds,
    ClanRef? Clan = null,
    int? StartingTrophies = null,
    List<CrBattleCard>? SupportCards = null);
