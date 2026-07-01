using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DomainMathTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-100)]
    public void PopularityWeight_IsZero_ForNonPositivePlayerCounts(int players)
    {
        Assert.Equal(0, DomainMath.PopularityWeight(players));
    }

    [Fact]
    public void PopularityWeight_EqualsHalf_AtThePrior()
    {
        // players / (players + prior); prior is 4, so 4 players -> 0.5.
        Assert.Equal(0.5, DomainMath.PopularityWeight(4), 10);
    }

    [Fact]
    public void PopularityWeight_RisesWithPlayers_AndStaysBelowOne()
    {
        double previous = 0;
        foreach (var players in new[] { 1, 4, 8, 20, 50, 100, 1000 })
        {
            var w = DomainMath.PopularityWeight(players);
            Assert.True(w > previous, $"weight should increase at {players}");
            Assert.True(w < 1, $"weight should saturate below 1 at {players}");
            previous = w;
        }
    }
}
