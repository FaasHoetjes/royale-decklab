namespace RoyaleDeckLab.Api.Dtos;

/// <summary>Rounds is populated for duels.</summary>
public sealed record CrBattleSide(
    string? Tag,
    string? Name,
    List<CrBattleCard>? Cards,
    int Crowns,
    List<CrBattleRound>? Rounds);
