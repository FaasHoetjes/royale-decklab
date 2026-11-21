namespace RoyaleDeckLab.Api.Options;

public sealed class LadderOptions : PlayerPollOptions
{
    public const string SectionName = "Ladder";

    private const long Hour = 60L * 60 * 1000;
    private const long Day = 24 * Hour;

    public LadderOptions()
    {
        PollIntervalMs = Hour;

        // Clear of the startup meta load, the Crown Series poll and the season boost check.
        StartupDelayMs = 10L * 60 * 1000;

        MaxPlayersPerGroup = 500;

        SeedsPerPoll = 500;
        ClansPerPoll = 20;
        SeedRetryMs = 3 * Day;
        ActiveSeedRetryMs = 12 * Hour;
        ActiveSeedWindowMs = 2 * Day;
        ClanmateSeenWithinMs = 3 * Day;

        // Ladder opponents are matched on trophies, so each step stays in the range it started from.
        OpponentStepsPerPoll = 2;

        VisitorWaitMs = 3 * Day;
        VisitorRereadMs = 4 * Hour;
        VisitorsPerPoll = 250;

        // Stats need a fair sample, not every battle, so a reread waits until most of the log is new.
        RereadSpanShare = 0.85;
        MaxRereadIntervalMs = 48 * Hour;

        ForgetAfterMs = 3 * Day;
    }

    // Ladder is played every day, so two weeks hold far more games per trophy range than war's 30 days.
    public long RetentionMs { get; set; } = 14 * Day;

    public int TrophyBandWidth { get; set; } = 1000;

    // Below this, players are still filling their collection; their battles are stored but not followed.
    public int MinTrophies { get; set; } = 4000;

    // Log reads per poll, shared by rereads, seeds and opponents, so the war crawl and Crown Series keep most of the key.
    public int ReadsPerPoll { get; set; } = 2000;

    // Crown Series weekends need the key most.
    public int ReadsPerPollDuringDuels { get; set; } = 500;

    // How much a side in a neighbouring range or league counts in a range's decks at most, compounding per step
    // further away.
    public double OtherRangeWeight { get; set; } = 0.5;

    // A range borrows at most as many weighted sides from others as it has of its own, and at least this many, so a
    // thin range still gets decks. A judgement value, as in Crown Series, until the ranges can be compared.
    public int MinBorrowedSides { get; set; } = 2000;
}
