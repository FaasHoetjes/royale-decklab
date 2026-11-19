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

        MaxPlayersPerGroup = 1000;

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

        MaxRereadIntervalMs = 24 * Hour;

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
}
