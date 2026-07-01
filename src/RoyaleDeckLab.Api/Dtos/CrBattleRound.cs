namespace RoyaleDeckLab.Api.Dtos;

/// <summary>One round of a river-race duel (each round is its own deck + crown count).</summary>
public sealed record CrBattleRound(int Crowns, List<CrBattleCard>? Cards);
