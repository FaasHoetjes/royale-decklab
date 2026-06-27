using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

/// <summary>
/// A row in the <c>battles</c> table. Card ids and versions are stored as JSON
/// text columns (configured via value converters in <see cref="MetaDbContext"/>),
/// matching the schema the Bun BattleStore created.
/// </summary>
public sealed class BattleEntity
{
    /// <summary>Primary key. Dedup: one player's battle at one time is one observation.</summary>
    public string Key { get; set; } = "";

    public string BattleTime { get; set; } = "";

    /// <summary>battleTime parsed to epoch ms; the indexed column the prune rides.</summary>
    public long BattleTimeMs { get; set; }

    public string PlayerTag { get; set; } = "";

    public int[] CardIds { get; set; } = [];

    public BattleResult Result { get; set; }

    public IReadOnlyList<CardVersion> CardVersions { get; set; } = [];
}

/// <summary>
/// The single-row <c>meta_state</c> table holding the patch boundary and last
/// successful fetch time (what used to live in the JSON files' headers).
/// </summary>
public sealed class MetaStateEntity
{
    public int Id { get; set; } = 1;
    public long EpochStartMs { get; set; }
    public long LastBuildMs { get; set; }
}
