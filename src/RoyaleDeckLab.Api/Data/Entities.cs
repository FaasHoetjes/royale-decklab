using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

// Card ids and versions are stored as JSON text columns (value converters in MetaDbContext).
public sealed class BattleEntity
{
    // Dedup: one player's battle at one time is one observation.
    public string Key { get; set; } = "";

    public string BattleTime { get; set; } = "";

    // Parsed to epoch ms; the indexed column the prune rides.
    public long BattleTimeMs { get; set; }

    public string PlayerTag { get; set; } = "";

    public int[] CardIds { get; set; } = [];

    public BattleResult Result { get; set; }

    public IReadOnlyList<CardVersion> CardVersions { get; set; } = [];
}

public sealed class MetaStateEntity
{
    public int Id { get; set; } = 1;
    public long EpochStartMs { get; set; }
    public long LastBuildMs { get; set; }
}
