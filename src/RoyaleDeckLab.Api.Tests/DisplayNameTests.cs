using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DisplayNameTests
{
    [Theory]
    [InlineData("<c6>Clash4Cash", "Clash4Cash")]
    [InlineData("<c2>Red</c> Team", "Red Team")]
    [InlineData("Plain <3 name", "Plain <3 name")]
    public void ColourMarkup_IsLeftOut(string raw, string shown)
    {
        Assert.Equal(shown, DisplayName.Clean(raw, "#TAG"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("<c1></c>")]
    public void ANameThatIsOnlyMarkup_FallsBackToTheTag(string? raw)
    {
        Assert.Equal("#TAG", DisplayName.Clean(raw, "#TAG"));
    }
}
