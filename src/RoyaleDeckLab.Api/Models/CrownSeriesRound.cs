namespace RoyaleDeckLab.Api.Models;

/// <summary>One player's deck in one round of a Crown Series Duel.</summary>
public sealed record CrownSeriesRound
{
    public required string PlayerTag { get; init; }

    public required string OpponentTag { get; init; }

    public required long BattleTimeMs { get; init; }

    public required int Round { get; init; }

    public required BattleResult Result { get; init; }

    /// <summary>By card id.</summary>
    public required IReadOnlyList<CrownSeriesCard> Cards { get; init; }

    public required int League { get; init; }

    public required string EventTag { get; init; }

    public required int GameModeId { get; init; }

    public string Key => $"{PlayerTag}|{BattleTimeMs}|r{Round}";
}
