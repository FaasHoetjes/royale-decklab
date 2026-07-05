using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class PlayerTagTests
{
    [Theory]
    [InlineData("2QGG92L9")]
    [InlineData("#2QGG92L9")]
    [InlineData("#2qgg92l9")] // case-insensitive
    [InlineData("PYL")]       // minimum length
    [InlineData("#0289PYLQGRJCUV")] // full alphabet, maximum length
    public void ValidTags_Pass(string tag)
        => Assert.True(PlayerTag.IsValid(tag));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("#")]
    [InlineData("PY")]                 // too short
    [InlineData("0289PYLQGRJCUV0")]    // too long
    [InlineData("#ABC")]               // A/B not in the tag alphabet
    [InlineData("#2QGG92LO")]          // letter O is never used (only zero)
    [InlineData("#2QGG 92L9")]         // inner whitespace
    [InlineData("2QGG92L9;DROP")]      // punctuation/garbage
    [InlineData("#2QG#92L9")]          // '#' only allowed as leading prefix
    public void InvalidTags_Fail(string? tag)
        => Assert.False(PlayerTag.IsValid(tag));
}
