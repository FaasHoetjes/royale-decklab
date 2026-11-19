namespace RoyaleDeckLab.Api.Options;

public sealed class LadderOptions
{
    public const string SectionName = "Ladder";

    // Ladder is played every day, so two weeks hold far more games per trophy range than war's 30 days.
    public long RetentionMs { get; set; } = 14L * 24 * 60 * 60 * 1000;

    public int TrophyBandWidth { get; set; } = 1000;
}
