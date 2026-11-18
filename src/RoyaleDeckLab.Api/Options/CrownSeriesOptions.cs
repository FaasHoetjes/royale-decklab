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

    // An idle seed without Duels may play next weekend.
    public long SeedRetryMs { get; set; } = 5L * 24 * 60 * 60 * 1000;

    // A seed who battled lately but had no Duel yet, and a lower-league clan, are tried again this soon: about 40% of
    // a weekend's players start their Duels more than 12 h in.
    public long ActiveSeedRetryMs { get; set; } = 12L * 60 * 60 * 1000;

    // A seed whose newest battle is this recent counts as active.
    public long ActiveSeedWindowMs { get; set; } = 2L * 24 * 60 * 60 * 1000;

    // Clanmates not seen online this recently are unlikely to play this weekend's Duels.
    public long ClanmateSeenWithinMs { get; set; } = 3L * 24 * 60 * 60 * 1000;

    // The war crawl's player list changes with the war refresh, not every poll.
    public long WarPlayersRefreshMs { get; set; } = 6L * 60 * 60 * 1000;

    // How many times a poll follows the new opponents found below King's League: each read can turn up more, and
    // they are near certain to play Duels at that cap.
    public int OpponentStepsPerPoll { get; set; } = 4;

    // How long a visitor who looked themselves up stays waiting while no Duel of theirs shows up; Duel weekends are a
    // week or two apart.
    public long VisitorWaitMs { get; set; } = 14L * 24 * 60 * 60 * 1000;

    // A waiting visitor whose log showed no Duel yet is tried again after this long, not every poll.
    public long VisitorRereadMs { get; set; } = 4L * 60 * 60 * 1000;

    // Visitors take at most this share of a poll's seeds, so the site's traffic can't crowd out the other sources.
    public int VisitorsPerPoll { get; set; } = 500;

    // How much a round at a neighbouring cap counts in a league's decks at most, compounding per cap further away.
    public double OtherCapWeight { get; set; } = 0.5;

    // A league borrows at most as many weighted rounds from other caps as it has of its own, and at least this many,
    // so a thin league still gets decks. A judgement value: one weekend can't fit it yet.
    public int MinBorrowedRounds { get; set; } = 2000;

    // How many players are read to see whether a Duel weekend is on, when no stored Duel says so.
    public int ProbePlayers { get; set; } = 20;

    // A Duel played this recently means the weekend is on.
    public long LiveDuelWindowMs { get; set; } = 2L * 60 * 60 * 1000;

    // A log holds about 30 battles; one that took days to fill needn't be read every hour.
    public long MaxRereadIntervalMs { get; set; } = 8L * 60 * 60 * 1000;

    // A player who left the Ranked list and hasn't played a Duel in this long is no longer read; Duel weekends are
    // a week or two apart.
    public long ForgetAfterMs { get; set; } = 21L * 24 * 60 * 60 * 1000;
}
