namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// A single observed battle, the raw unit the rolling meta store is built from.
/// Battles are kept (deduped by <see cref="Key"/>, pruned to a time window)
/// across refreshes so deck samples accumulate instead of resetting on every
/// rebuild.
/// </summary>
public sealed record BattleRecord
{
    /// <summary>Dedup key: a given player's battle at a given time is one observation.</summary>
    public required string Key { get; init; }

    /// <summary>Raw API battleTime, e.g. "20240617T120000.000Z". Used for pruning.</summary>
    public required string BattleTime { get; init; }

    public required string PlayerTag { get; init; }

    /// <summary>The 8 card ids, sorted ascending so an identical deck always keys the same.</summary>
    public required int[] CardIds { get; init; }

    public required BattleResult Result { get; init; }

    public required IReadOnlyList<CardVersion> CardVersions { get; init; }
}
