namespace RoyaleDeckLab.Api.Models;

/// <summary>One player's deck in one round of a Crown Series Duel.</summary>
public sealed record CrownSeriesRound
{
    public required string Key { get; init; }

    /// <summary>The same for both players and every round of one Duel.</summary>
    public required string MatchKey { get; init; }

    public required string PlayerTag { get; init; }

    public required string BattleTime { get; init; }

    public required long BattleTimeMs { get; init; }

    public required int Round { get; init; }

    public required BattleResult Result { get; init; }

    public required int[] CardIds { get; init; }

    public required IReadOnlyList<CardLevel> CardLevels { get; init; }

    public required IReadOnlyList<CardVersion> CardVersions { get; init; }

    public required int League { get; init; }

    public required string EventTag { get; init; }

    public required int GameModeId { get; init; }
}
