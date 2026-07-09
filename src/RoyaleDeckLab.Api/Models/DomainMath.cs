namespace RoyaleDeckLab.Api.Models;

public static class DomainMath
{
    /// <summary>
    /// Smoothing constant for the popularity weight. At 4: 1 player → 0.20,
    /// 4 → 0.50, 8 → 0.67, 20 → 0.83.
    /// </summary>
    public const int PlayerPrior = 4;

    public static double PopularityWeight(int players)
        => players <= 0 ? 0 : (double)players / (players + PlayerPrior);
}
