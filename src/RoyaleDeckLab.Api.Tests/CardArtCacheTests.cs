using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CardArtCacheTests
{
    [Theory]
    [InlineData("cards", "jAj1Q5rclXxU9kVImGqSJxa4wEMfEhvwNQ_4jiGUuqg")]
    [InlineData("cardevolutions", "jAj1Q5rclXxU9kVImGqSJxa4wEMfEhvwNQ_4jiGUuqg")]
    [InlineData("cardheroes", "LjSfSbwQfkZuRJY4pVxKspZ-a0iM5KAhU8w-a_N5Z7Y")]
    public void CatalogShapedArt_IsWellFormed(string kind, string hash)
        => Assert.True(CardArtCache.IsWellFormed(kind, hash));

    [Theory]
    [InlineData("badges", "jAj1Q5rclXxU9kVImGqSJxa4wEMfEhvwNQ_4jiGUuqg")] // not a card art folder
    [InlineData("cards", "short")]
    [InlineData("cards", "..%2F..%2Fmeta")]
    [InlineData("cards", "../../meta.db")]
    [InlineData("cards", "jAj1Q5rclXxU9kVImGqSJxa4wEMfEhvwNQ.png")]
    [InlineData("../cards", "jAj1Q5rclXxU9kVImGqSJxa4wEMfEhvwNQ_4jiGUuqg")]
    public void AnythingElse_IsRejected(string kind, string hash)
        => Assert.False(CardArtCache.IsWellFormed(kind, hash));
}
