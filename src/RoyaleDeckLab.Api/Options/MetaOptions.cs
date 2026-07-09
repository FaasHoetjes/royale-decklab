namespace RoyaleDeckLab.Api.Options;

public sealed class MetaOptions
{
    public const string SectionName = "Meta";

    // Relative to the app's working dir.
    public string DbPath { get; set; } = "../../meta.db";

    // Clan war runs on weekends, so 7 days captured only a single war; 30 days
    // keeps roughly four war weekends. If a balance patch lands mid-window,
    // POST /meta/epoch to floor the cutoff at the patch time.
    public long BattleWindowMs { get; set; } = 30L * 24 * 60 * 60 * 1000;

    public long CacheRefreshIntervalMs { get; set; } = 24L * 60 * 60 * 1000;

    public long BackgroundRefreshIntervalMs { get; set; } = 2L * 60 * 60 * 1000;

    // ~5000 players sampled at 50 members/clan.
    public int MaxWarClans { get; set; } = 100;

    public int WarRecordTarget { get; set; } = 250_000;
}
