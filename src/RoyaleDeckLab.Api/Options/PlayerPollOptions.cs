namespace RoyaleDeckLab.Api.Options;

public abstract class PlayerPollOptions
{
    public long PollIntervalMs { get; set; }

    public long StartupDelayMs { get; set; }

    public int MaxPlayersPerGroup { get; set; }

    public int SeedsPerPoll { get; set; }

    public int ClansPerPoll { get; set; }

    public long SeedRetryMs { get; set; }

    public long ActiveSeedRetryMs { get; set; }

    public long ActiveSeedWindowMs { get; set; }

    public long ClanmateSeenWithinMs { get; set; }

    public int OpponentStepsPerPoll { get; set; }

    public long VisitorWaitMs { get; set; }

    public long VisitorRereadMs { get; set; }

    public int VisitorsPerPoll { get; set; }

    public long MaxRereadIntervalMs { get; set; }

    public long ForgetAfterMs { get; set; }
}
