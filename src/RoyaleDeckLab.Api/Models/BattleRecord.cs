namespace RoyaleDeckLab.Api.Models;

public sealed record BattleRecord
{
    public required string Key { get; init; }

    public required string BattleTime { get; init; }

    public required long BattleTimeMs { get; init; }

    public required string PlayerTag { get; init; }

    public required int[] CardIds { get; init; }

    public required BattleResult Result { get; init; }

    public required IReadOnlyList<CardVersion> CardVersions { get; init; }
}
