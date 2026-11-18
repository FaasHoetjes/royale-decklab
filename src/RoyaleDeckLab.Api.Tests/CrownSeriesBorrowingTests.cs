using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CrownSeriesBorrowingTests
{
    private const double OtherCapWeight = 0.5;
    private const int MinBorrowed = 2000;

    private static IReadOnlyDictionary<int, double> WeightsFor(int cap, Dictionary<int, int> roundsPerCap)
        => CrownSeriesBorrowing.WeightsFor(cap, roundsPerCap, OtherCapWeight, MinBorrowed);

    private static double Borrowed(int cap, Dictionary<int, int> roundsPerCap, IReadOnlyDictionary<int, double> weights)
        => roundsPerCap
            .Where(c => c.Key != cap)
            .Sum(c => c.Value * weights.GetValueOrDefault(c.Key));

    [Fact]
    public void A_thin_league_fills_its_budget_from_the_nearest_caps_and_not_from_kings()
    {
        var rounds = new Dictionary<int, int> { [11] = 136, [12] = 344, [13] = 3882, [14] = 7558, [16] = 95_426 };

        var weights = WeightsFor(11, rounds);

        Assert.Equal(1.0, weights[11]);
        Assert.Equal(0.5, weights[12]);
        Assert.Equal(0.25, weights[13]);
        Assert.InRange(weights[14], 0.0, 0.125);
        Assert.Equal(0.0, weights[16]);
        Assert.Equal(MinBorrowed, Borrowed(11, rounds, weights), precision: 6);
    }

    [Fact]
    public void A_league_borrows_no_more_than_its_own_rounds()
    {
        var rounds = new Dictionary<int, int> { [14] = 7558, [15] = 7698, [16] = 95_426 };

        var weights = WeightsFor(14, rounds);

        Assert.Equal(0.5, weights[15]);
        Assert.Equal(7558, Borrowed(14, rounds, weights), precision: 6);
    }

    [Fact]
    public void Other_caps_count_fully_weighted_while_they_fit_the_budget()
    {
        var rounds = new Dictionary<int, int> { [13] = 60, [16] = 60 };

        var weights = WeightsFor(13, rounds);

        Assert.Equal(0.125, weights[16]);
    }

    [Fact]
    public void A_league_with_no_rounds_still_borrows_the_minimum()
    {
        var rounds = new Dictionary<int, int> { [16] = 95_426 };

        var weights = WeightsFor(11, rounds);

        Assert.Equal(MinBorrowed, Borrowed(11, rounds, weights), precision: 6);
    }
}
