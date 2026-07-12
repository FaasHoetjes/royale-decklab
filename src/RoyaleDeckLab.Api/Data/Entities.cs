using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

public sealed class BattleEntity
{
    public string Key { get; set; } = "";

    public string BattleTime { get; set; } = "";

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
    public int KnownSeasonId { get; set; }
}
