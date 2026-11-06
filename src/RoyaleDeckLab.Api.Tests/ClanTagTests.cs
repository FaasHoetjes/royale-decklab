using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ClanTagTests
{
    [Theory]
    [InlineData("L9VRJ")]
    [InlineData("#L9VRJ")]
    [InlineData("l9vrj")]
    public void Spellings_BecomeTheApiForm(string raw)
    {
        Assert.True(ClanTag.TryParse(raw, out var tag));
        Assert.Equal("#L9VRJ", tag.Value);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("#ABC")]
    [InlineData("L9VRJ/war")]
    public void NonTags_AreRejected(string? raw)
    {
        Assert.False(ClanTag.TryParse(raw, out _));
    }
}
