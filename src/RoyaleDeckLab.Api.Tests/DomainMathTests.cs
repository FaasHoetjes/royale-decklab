using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DomainMathTests
{
    private static readonly MetaOptions Defaults = new();

    private static double Cautious(double wins, double games)
        => DomainMath.PosteriorQuantile(wins, games, Defaults.PriorGames, Defaults.PriorWinRate, Defaults.RankingQuantile);

    [Theory]
    // Reference values: scipy.stats.beta.ppf(0.25, wins + 0.52 * 80, losses + 0.48 * 80).
    [InlineData(0, 0, 0.4823523140941362)]
    [InlineData(6, 6, 0.5175029065800183)]
    [InlineData(180, 300, 0.5661728348014692)]
    [InlineData(0.5, 2.5, 0.4731658383482059)]
    [InlineData(3000, 5400, 0.550512023491962)]
    [InlineData(0, 50, 0.29189716330095417)]
    public void PosteriorQuantile_MatchesTheBetaQuantile(double wins, double games, double expected)
    {
        Assert.Equal(expected, Cautious(wins, games), 9);
    }

    [Theory]
    [InlineData(40, 40, 0.5, 0.5)]
    [InlineData(2.5, 7.25, 0.1, 0.09613061442467215)]
    [InlineData(0.7, 1.3, 0.9, 0.7733460978359749)]
    public void InverseRegularizedBeta_MatchesScipy(double a, double b, double p, double expected)
    {
        Assert.Equal(expected, DomainMath.InverseRegularizedBeta(a, b, p), 9);
    }

    [Fact]
    public void PosteriorQuantile_RatesASixForSixDeck_BarelyAboveTheBaseline()
    {
        // A handful of perfect games is promising, not proof: 51.8%, where plain shrinkage (k=30) said 58%.
        Assert.InRange(Cautious(6, 6), 0.51, 0.53);
    }

    [Fact]
    public void LargeProvenSample_OutranksAHotStreak()
    {
        // 60% over 550 games beats 80% over 25: the 30-game shrinkage ranked the streak first (0.636 vs 0.595).
        Assert.True(Cautious(330, 550) > Cautious(20, 25));
    }

    [Fact]
    public void PosteriorQuantile_TrustsTheObservedRateMore_AsTheSampleGrows()
    {
        Assert.True(Cautious(60, 100) > Cautious(6, 10));
        Assert.True(Cautious(600, 1000) > Cautious(60, 100));
    }

    [Fact]
    public void PosteriorQuantile_IsMoreCautious_ForALowerQuantile()
    {
        var q20 = DomainMath.PosteriorQuantile(20, 30, 80, 0.52, 0.20);
        var q50 = DomainMath.PosteriorQuantile(20, 30, 80, 0.52, 0.50);
        Assert.True(q20 < q50);
    }
}
