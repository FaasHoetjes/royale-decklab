using RoyaleDeckLab.Api.Dtos;
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

    [Fact]
    public void APlayerAndTheirClan_AreNamedWithoutMarkup()
    {
        var player = new CrPlayer("#2QGG92L9", "<c6>Ace", null, new ClanRef("#L9VRJ", "<c2>Red</c> Team"));

        var shown = player.WithDisplayNames();

        Assert.Equal("Ace", shown.Name);
        Assert.Equal("Red Team", shown.Clan?.Name);
    }

    [Fact]
    public void ClansFoundByName_AreNamedWithoutMarkup()
    {
        var found = new CrClanSummary("#L9VRJ", "<c2>Red</c> Team", "open", null, 3000, null, 50);

        var clan = Assert.Single(ClanSummary.ListFrom([found]));

        Assert.Equal("Red Team", clan.Name);
    }
}
