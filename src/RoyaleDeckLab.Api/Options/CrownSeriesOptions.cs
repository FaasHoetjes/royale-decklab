namespace RoyaleDeckLab.Api.Options;

public sealed class CrownSeriesOptions
{
    public const string SectionName = "CrownSeries";

    public long PollIntervalMs { get; set; } = 60L * 60 * 1000;

    // Leaves the first poll after a deploy clear of the startup meta load.
    public long StartupDelayMs { get; set; } = 3L * 60 * 1000;

    // The global Ranked leaderboard lists at most 1000 players.
    public int RankedPlayers { get; set; } = 1000;

    // Tracked players per league cap: the Ranked ones plus the Duel opponents and seeds found there. Opponents play in
    // the same league, so each cap fills from its own players.
    public int MaxPlayersPerCap { get; set; } = 2000;

    // Players outside the tracked ones read per poll while a cap below King's still has room, to find players in the
    // lower leagues: the site's Crown Series visitors first, then players met near a lower-league player, then war
    // crawl players.
    public int SeedsPerPoll { get; set; } = 1000;

    // Clans of lower-league players whose members are tried as seeds per poll; each costs one extra request.
    public int ClansPerPoll { get; set; } = 20;

    // A seed without Duels may play next weekend.
    public long SeedRetryMs { get; set; } = 5L * 24 * 60 * 60 * 1000;

    // How much a round at a neighbouring cap counts in a league's decks at most, compounding per cap further away.
    public double OtherCapWeight { get; set; } = 0.5;

    // A league borrows at most as many weighted rounds from other caps as it has of its own, and at least this many,
    // so a thin league still gets decks. A judgement value: one weekend can't fit it yet.
    public int MinBorrowedRounds { get; set; } = 2000;

    // How many players are read to see whether a Duel weekend is on, when no stored Duel says so.
    public int ProbePlayers { get; set; } = 100;

    // A Duel played this recently means the weekend is on.
    public long LiveDuelWindowMs { get; set; } = 2L * 60 * 60 * 1000;

    // A log holds about 30 battles; one that took days to fill needn't be read every hour.
    public long MaxRereadIntervalMs { get; set; } = 8L * 60 * 60 * 1000;

    // A player who left the Ranked list and hasn't played a Duel in this long is no longer read; Duel weekends are
    // a week or two apart.
    public long ForgetAfterMs { get; set; } = 21L * 24 * 60 * 60 * 1000;
}
