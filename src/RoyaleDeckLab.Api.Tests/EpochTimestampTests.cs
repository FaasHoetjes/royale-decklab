using RoyaleDeckLab.Api.Controllers;

namespace RoyaleDeckLab.Api.Tests;

public sealed class EpochTimestampTests
{
    private const long Now = 1_780_000_000_000;

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("{}")]
    [InlineData("""{"timestamp":null}""")]
    [InlineData("""{"timestamp":"now"}""")]
    public void NoTimestamp_MeansNow(string body)
    {
        Assert.Equal(Now, MetaController.EpochTimestamp(body, Now));
    }

    [Fact]
    public void ReadsEpochMilliseconds()
    {
        Assert.Equal(1_700_000_000_000, MetaController.EpochTimestamp("""{"timestamp":1700000000000}""", Now));
    }

    [Fact]
    public void ReadsAnIsoDateAsUtc()
    {
        Assert.Equal(
            new DateTimeOffset(2026, 10, 1, 8, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(),
            MetaController.EpochTimestamp("""{"timestamp":"2026-10-01T08:00:00"}""", Now));
    }

    [Theory]
    [InlineData("""{"timestamp":"2026-10-01T08:00:00""")]
    [InlineData("timestamp=now")]
    [InlineData("[]")]
    [InlineData("""{"timestamp":"yesterday"}""")]
    [InlineData("""{"timestamp":1.5}""")]
    [InlineData("""{"timestamp":true}""")]
    public void UnreadableBodies_AreRejectedInsteadOfMeaningNow(string body)
    {
        Assert.Null(MetaController.EpochTimestamp(body, Now));
    }
}
