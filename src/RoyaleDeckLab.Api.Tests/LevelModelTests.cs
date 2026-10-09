using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class LevelModelTests
{
    [Fact]
    public void DisplayLevel_UsesTheUnifiedSixteenScale()
    {
        Assert.Equal(16, LevelModel.DisplayLevel(Build.Card(1, level: 14, maxLevel: 14)));
        Assert.Equal(11, LevelModel.DisplayLevel(Build.Card(1, level: 3, maxLevel: 8)));
    }

    [Fact]
    public void OpponentLevel_IsPredictedFromTheBest32Cards()
    {
        // 32 cards at 15 plus a weak tail the lineup never needs: 8.8 + 0.43 x 15.
        var cards = Enumerable.Range(1, 32).Select(id => Build.Card(id, level: 13))
            .Concat(Enumerable.Range(33, 20).Select(id => Build.Card(id, level: 5)))
            .ToList();

        Assert.Equal(8.8 + 0.43 * 15, LevelModel.OpponentLevel(cards), 10);
    }

    [Fact]
    public void LevelLogit_IsZero_ForAnEvenDeckAtTheOpponentsLevel()
    {
        Assert.Equal(0, LevelModel.LevelLogit([15, 15, 15, 15, 15, 15, 15, 15], 15), 10);
    }

    [Fact]
    public void LevelLogit_ChargesTheWeakestCard_OnTopOfTheAverage()
    {
        // Mean 15.375 vs opponents at 15.375: no average term; weakest card 4.375 below the mean.
        int[] levels = [16, 16, 16, 16, 16, 16, 16, 11];

        Assert.Equal(-0.14 * 4.375, LevelModel.LevelLogit(levels, 15.375), 10);
    }

    [Theory]
    [InlineData(0.0, 0.0)]
    [InlineData(1.0, 1.0)]
    public void WinProbability_PinsTheExtremes(double baseWinRate, double expected)
    {
        Assert.Equal(expected, LevelModel.WinProbability(baseWinRate, levelLogit: -2), 10);
    }
}
