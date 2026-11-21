namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// How card levels move Trophy Road and Ranked odds. Not fitted on ladder battles yet: until it is, it borrows the war
/// fit and the Duel value of evos and heroes.
/// </summary>
public static class LadderLevels
{
    public static LevelFit Fit { get; } = LevelFit.War;

    public static SpecialValues Specials => CrownSeriesLevels.Specials;

    /// <summary>What a side wins on levels alone against an equally strong deck; even when the opponent's are unknown.</summary>
    public static double ExpectedWinShare(byte[] levels, byte[]? opponentLevels)
    {
        if (opponentLevels is not { Length: > 0 } || levels.Length == 0)
        {
            return 0.5;
        }
        var logit = Fit.Logit(Mean(levels), levels.Min(), Mean(opponentLevels));
        return LevelModel.WinProbability(0.5, logit);
    }

    public static double Mean(byte[] levels)
    {
        var total = 0;
        foreach (var level in levels)
        {
            total += level;
        }
        return (double)total / levels.Length;
    }
}
