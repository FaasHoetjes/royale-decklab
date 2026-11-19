namespace RoyaleDeckLab.Api.Options;

public sealed class CrownSeriesOptions : PlayerPollOptions
{
    public const string SectionName = "CrownSeries";

    private const long Hour = 60L * 60 * 1000;
    private const long Day = 24 * Hour;

    public CrownSeriesOptions()
    {
        PollIntervalMs = Hour;

        // Leaves the first poll after a deploy clear of the startup meta load.
        StartupDelayMs = 3L * 60 * 1000;

        MaxPlayersPerGroup = 2000;

        SeedsPerPoll = 1000;

        ClansPerPoll = 20;

        SeedRetryMs = 5 * Day;

        // A seed who battled lately but had no Duel yet, and a lower-league clan, are tried again this soon: about 40%
        // of a weekend's players start their Duels more than 12 h in.
        ActiveSeedRetryMs = 12 * Hour;

        ActiveSeedWindowMs = 2 * Day;

        ClanmateSeenWithinMs = 3 * Day;

        // Each read below King's League can turn up more opponents, near certain to play Duels at that cap.
        OpponentStepsPerPoll = 4;

        // Duel weekends are a week or two apart.
        VisitorWaitMs = 14 * Day;
        VisitorRereadMs = 4 * Hour;

        VisitorsPerPoll = 500;

        // A log holds about 30 battles; one that took days to fill needn't be read every hour.
        MaxRereadIntervalMs = 8 * Hour;

        ForgetAfterMs = 21 * Day;
    }

    // The global Ranked leaderboard lists at most 1000 players.
    public int RankedPlayers { get; set; } = 1000;

    public long WarPlayersRefreshMs { get; set; } = 6 * Hour;

    // How much a round at a neighbouring cap counts in a league's decks at most, compounding per cap further away.
    public double OtherCapWeight { get; set; } = 0.5;

    // A league borrows at most as many weighted rounds from other caps as it has of its own, and at least this many,
    // so a thin league still gets decks. A judgement value: one weekend can't fit it yet.
    public int MinBorrowedRounds { get; set; } = 2000;

    public int ProbePlayers { get; set; } = 20;

    public long LiveDuelWindowMs { get; set; } = 2 * Hour;
}
