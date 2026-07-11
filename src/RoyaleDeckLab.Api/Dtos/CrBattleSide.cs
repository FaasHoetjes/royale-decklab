namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrBattleSide(
    string? Tag,
    string? Name,
    List<CrBattleCard>? Cards,
    int Crowns,
    List<CrBattleRound>? Rounds);
