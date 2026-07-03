namespace RoyaleDeckLab.Api.Options;

/// <summary>Tuning for the rolling battle store and meta-refresh loop.</summary>
public sealed class MetaOptions
{
    public const string SectionName = "Meta";

    /// <summary>Path to the SQLite battle store. Relative to the app's working dir.</summary>
    public string DbPath { get; set; } = "../../meta.db";

    /// <summary>Rolling window of raw battles kept in the store (default 7 days).</summary>
    public long BattleWindowMs { get; set; } = 7L * 24 * 60 * 60 * 1000;

    /// <summary>Aggregated meta is fresh enough to serve on startup for this long (24h).</summary>
    public long CacheRefreshIntervalMs { get; set; } = 24L * 60 * 60 * 1000;

    /// <summary>How often the background job rebuilds the meta while the server is up (2h).</summary>
    public long BackgroundRefreshIntervalMs { get; set; } = 2L * 60 * 60 * 1000;

    /// <summary>Top war clans sampled per rebuild (~5000 players at 50/clan).</summary>
    public int MaxWarClans { get; set; } = 100;

    /// <summary>Runaway safety ceiling on records collected per rebuild.</summary>
    public int WarRecordTarget { get; set; } = 250_000;
}
