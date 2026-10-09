namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// How card levels move a deck's war win odds, fitted on 9,093 Clan War battles (Oct 2026, held-out
/// log loss, trophies controlled): each level a deck's average card level sits above its opponent's adds
/// ~0.67 log-odds, and each level its weakest card trails the deck's own average costs a further ~0.14.
/// Levels use the unified 1-16 scale.
/// </summary>
public static class LevelModel
{
    public const int MaxDisplayLevel = 16;
    public const double PerLevel = 0.67;
    public const double WeakestCard = 0.14;

    // War opponents' average deck level, predicted from the player's 32 best-leveled cards
    // (213 players, R² 0.27): opponents are pulled toward ~15.6. Little data below level 14.
    public const double OpponentIntercept = 8.8;
    public const double OpponentSlope = 0.43;
    public const int LineupCards = 32;

    public static int DisplayLevel(PlayerItemLevel card)
        => MaxDisplayLevel - Math.Max(0, card.MaxLevel - card.Level);

    public static double OpponentLevel(IEnumerable<PlayerItemLevel> collection)
    {
        var best = collection.Select(DisplayLevel).OrderDescending().Take(LineupCards).ToList();
        var typical = best.Count > 0 ? best.Average() : MaxDisplayLevel;
        return OpponentIntercept + OpponentSlope * typical;
    }

    public static double LevelLogit(IReadOnlyCollection<int> displayLevels, double opponentLevel)
    {
        var mean = displayLevels.Average();
        return PerLevel * (mean - opponentLevel) - WeakestCard * (mean - displayLevels.Min());
    }

    public static double WinProbability(double baseWinRate, double levelLogit)
    {
        if (baseWinRate <= 0)
        {
            return 0;
        }
        if (baseWinRate >= 1)
        {
            return 1;
        }
        var logit = Math.Log(baseWinRate / (1 - baseWinRate)) + levelLogit;
        return 1 / (1 + Math.Exp(-logit));
    }
}
