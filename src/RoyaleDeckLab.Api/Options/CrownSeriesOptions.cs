namespace RoyaleDeckLab.Api.Options;

public sealed class CrownSeriesOptions
{
    public const string SectionName = "CrownSeries";

    public long PollIntervalMs { get; set; } = 60L * 60 * 1000;

    // Leaves the first poll after a deploy clear of the startup meta load.
    public long StartupDelayMs { get; set; } = 3L * 60 * 1000;

    // The global Ranked leaderboard lists at most 1000 players.
    public int RankedPlayers { get; set; } = 1000;

    // Every tracked player: the Ranked ones plus the Duel opponents found in their logs.
    public int MaxPlayers { get; set; } = 3000;

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
