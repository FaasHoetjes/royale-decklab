namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrBattle(
    string Type,
    string BattleTime,
    CrGameMode? GameMode,
    string? DeckSelection,
    List<CrBattleSide>? Team,
    List<CrBattleSide>? Opponent);
