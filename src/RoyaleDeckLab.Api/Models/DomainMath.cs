namespace RoyaleDeckLab.Api.Models;

/// <summary>Domain math shared across the meta pipeline.</summary>
public static class DomainMath
{
    /// <summary>
    /// Smoothing constant for the popularity weight. At 4: 1 player → 0.20,
    /// 4 → 0.50, 8 → 0.67, 20 → 0.83.
    /// </summary>
    public const int PlayerPrior = 4;

    /// <summary>
    /// How much to trust a deck as genuinely "meta" based on how many distinct top
    /// players ran it. Returns a factor in (0, 1) that rises with player count and
    /// saturates — no hard cutoff, in the same spirit as the Wilson bound.
    /// </summary>
    public static double PopularityWeight(int players)
        => players <= 0 ? 0 : (double)players / (players + PlayerPrior);
}
