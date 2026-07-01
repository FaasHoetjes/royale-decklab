namespace RoyaleDeckLab.Api.Dtos;

/// <summary>One entry in a player's battle log (only the fields MetaBuilder reads).</summary>
public sealed record CrBattle(
    string Type,
    string BattleTime,
    CrGameMode? GameMode,
    string? DeckSelection,
    List<CrBattleSide>? Team,
    List<CrBattleSide>? Opponent);
