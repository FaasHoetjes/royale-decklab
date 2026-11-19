namespace RoyaleDeckLab.Api.Models;

public enum LadderMode
{
    TrophyRoad,
    Ranked,
}

/// <summary>One player's side of a Trophy Road or Ranked battle.</summary>
public sealed record LadderBattle
{
    public required string PlayerTag { get; init; }

    public required string OpponentTag { get; init; }

    public required long BattleTimeMs { get; init; }

    public required LadderMode Mode { get; init; }

    /// <summary>The player's trophies before the battle on Trophy Road, their league in Ranked.</summary>
    public required int Standing { get; init; }

    public required BattleResult Result { get; init; }

    /// <summary>By card id.</summary>
    public required IReadOnlyList<CrownSeriesCard> Cards { get; init; }
}
