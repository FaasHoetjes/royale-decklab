namespace RoyaleDeckLab.Api.Options;

public sealed class MetaOptions
{
    public const string SectionName = "Meta";

    public string DbPath { get; set; } = "../../meta.db";

    // Clan war runs on weekends, so 7 days captured only a single war; 30 days
    // keeps roughly four war weekends.
    public long BattleWindowMs { get; set; } = 30L * 24 * 60 * 60 * 1000;

    public long CacheRefreshIntervalMs { get; set; } = 24L * 60 * 60 * 1000;

    public long BackgroundRefreshIntervalMs { get; set; } = 2L * 60 * 60 * 1000;

    // ~5000 players sampled at 50 members/clan.
    public int MaxWarClans { get; set; } = 100;

    public int WarRecordTarget { get; set; } = 250_000;

    // Battles from before the patch boundary still count, at reduced weight,
    // so the meta isn't empty between a season rollover (Monday) and the next
    // war battle days (Thursday).
    public double PreEpochWeight { get; set; } = 0.25;

    public long SeasonCheckIntervalMs { get; set; } = 60L * 60 * 1000;

    // Any past Path of Legend season id works as a probe floor; 141 = July 2026.
    public int SeasonIdSeed { get; set; } = 141;
}
