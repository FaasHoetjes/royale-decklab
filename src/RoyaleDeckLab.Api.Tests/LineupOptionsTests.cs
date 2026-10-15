using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class LineupOptionsTests
{
    private static (bool ok, LineupOptions options, string? error) Parse(
        string? decks = null, string? minLevel = null, string? ban = null, string? require = null, params string[] locks)
    {
        var ok = LineupOptions.TryParse(decks, minLevel, ban, require, locks, out var options, out var error);
        return (ok, options, error);
    }

    [Fact]
    public void NoParameters_GiveTheDefaultOptions()
    {
        var (ok, options, _) = Parse();

        Assert.True(ok);
        Assert.Equal(4, options.DeckCount);
        Assert.Null(options.MinLevel);
        Assert.Empty(options.BannedCards);
        Assert.Empty(options.RequiredCards);
        Assert.Empty(options.LockedDecks);
    }

    [Fact]
    public void ParsesEveryOption()
    {
        var (ok, options, _) = Parse("3", "14", "1, 2", "9", "17,18,19,20,21,22,23,24");

        Assert.True(ok);
        Assert.Equal(3, options.DeckCount);
        Assert.Equal(14, options.MinLevel);
        Assert.Equal([1, 2], options.BannedCards.Order());
        Assert.Equal([9], options.RequiredCards);
        Assert.Equal(Build.Eight(17), Assert.Single(options.LockedDecks));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("5")]
    [InlineData("two")]
    public void RejectsADeckCountOutsideOneToFour(string decks)
    {
        Assert.False(Parse(decks: decks).ok);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("17")]
    [InlineData("high")]
    public void RejectsAMinimumLevelOutsideTheGame(string minLevel)
    {
        Assert.False(Parse(minLevel: minLevel).ok);
    }

    [Fact]
    public void RejectsCardIdsThatAreNotNumbers()
    {
        Assert.False(Parse(ban: "1,mortar").ok);
    }

    [Fact]
    public void RejectsACardThatIsBothBannedAndRequired()
    {
        Assert.False(Parse(ban: "1,2", require: "2").ok);
    }

    [Theory]
    [InlineData("1,2,3,4,5,6,7")]
    [InlineData("1,2,3,4,5,6,7,7")]
    public void RejectsALockedDeckWithoutEightDifferentCards(string locked)
    {
        Assert.False(Parse(locks: locked).ok);
    }

    [Fact]
    public void RejectsLockedDecksThatShareACard()
    {
        Assert.False(Parse(null, null, null, null, "1,2,3,4,5,6,7,8", "8,9,10,11,12,13,14,15").ok);
    }

    [Fact]
    public void RejectsALockedDeckWithABannedCard()
    {
        Assert.False(Parse(ban: "3", locks: "1,2,3,4,5,6,7,8").ok);
    }

    [Fact]
    public void RejectsMoreLockedDecksThanRequested()
    {
        Assert.False(Parse("1", null, null, null, "1,2,3,4,5,6,7,8", "9,10,11,12,13,14,15,16").ok);
    }
}
