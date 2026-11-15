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

    // How much a battle from before the patch boundary counts toward deck win
    // rates. Full weight predicted the following days' deck results best at
    // every boundary of Oct-Nov 2026, the Oct 19 balance update included, and
    // 0.25 never did better: a patch changes a few cards a little, while
    // discounting throws away most of a deck's games. A patch that reworks the
    // cards most decks use may call for less.
    public double PreEpochWeight { get; set; } = 1.0;

    // Decks rank by a cautious estimate: the RankingQuantile of their posterior win rate after adding
    // PriorGames imaginary games at PriorWinRate (fitted on one week of war battles, Oct 2026; overridable
    // with Meta__PriorGames etc.). 0.25 = "75% sure the deck is at least this good".
    public double PriorGames { get; set; } = 80;

    public double PriorWinRate { get; set; } = 0.52;

    public double RankingQuantile { get; set; } = 0.25;

    public long PatchCheckIntervalMs { get; set; } = 30L * 60 * 1000;

    public long SeasonBoostCheckIntervalMs { get; set; } = 12L * 60 * 60 * 1000;

    // Leaves the first check after a deploy clear of the startup meta load and the Crown Series poll.
    public long SeasonBoostStartupDelayMs { get; set; } = 5L * 60 * 1000;

    // On Nov 15, 2026, 600 players from war clans ranked 100 and below played each of the 7 boosted cards below King
    // Tower level at least 8 times in 3 days; 200 players found only 5 of the 7.
    public int SeasonBoostSamplePlayers { get; set; } = 600;
}
