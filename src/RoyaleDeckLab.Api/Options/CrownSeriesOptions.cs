namespace RoyaleDeckLab.Api.Options;

public sealed class CrownSeriesOptions
{
    public const string SectionName = "CrownSeries";

    // Some top Ranked players fill their 25-battle log in about two hours, so a slower poll loses their Duels.
    public long PollIntervalMs { get; set; } = 60L * 60 * 1000;

    // The global Ranked leaderboard lists at most 1000 players.
    public int RankedPlayers { get; set; } = 1000;

    // Ranked players plus the Duel opponents found in their logs.
    public int MaxPlayers { get; set; } = 3000;

    // How many of the top Ranked players are read first to see whether a Duel weekend is on.
    public int ProbePlayers { get; set; } = 100;

    // A Duel played this recently means the weekend is on; on a break weekend the logs only hold older ones.
    public long LiveDuelWindowMs { get; set; } = 6L * 60 * 60 * 1000;
}
