using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class WilsonLowerBoundTests
{
    [Fact]
    public void ReturnsZero_ForNoGames()
    {
        Assert.Equal(0, MetaBuilder.WilsonLowerBound(0, 0));
    }

    [Fact]
    public void IsAlwaysBelowTheObservedRate()
    {
        Assert.True(MetaBuilder.WilsonLowerBound(6, 10) < 0.6);
        Assert.True(MetaBuilder.WilsonLowerBound(60, 100) < 0.6);
    }

    [Fact]
    public void TightensTowardTheRate_AsTheSampleGrows()
    {
        var few = MetaBuilder.WilsonLowerBound(6, 10);
        var many = MetaBuilder.WilsonLowerBound(60, 100);
        Assert.True(many > few);
    }

    [Fact]
    public void LargeProvenSample_OutranksTinyPerfectSample()
    {
        // The whole point: "60% over 300" should beat "100% over 3".
        var perfectTiny = MetaBuilder.WilsonLowerBound(3, 3);
        var goodLarge = MetaBuilder.WilsonLowerBound(180, 300);
        Assert.True(goodLarge > perfectTiny);
    }

    [Fact]
    public void NeverReturnsNegative_ForALossHeavyDeck()
    {
        Assert.True(MetaBuilder.WilsonLowerBound(0, 50) >= 0);
    }
}
