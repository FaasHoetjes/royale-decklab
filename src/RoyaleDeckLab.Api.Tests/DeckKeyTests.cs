using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DeckKeyTests
{
    [Fact]
    public void SortsCardIds_SoOrderDoesNotMatter()
    {
        var a = MetaCache.DeckKey([8, 3, 1, 5, 2, 7, 6, 4]);
        var b = MetaCache.DeckKey([1, 2, 3, 4, 5, 6, 7, 8]);
        Assert.Equal(b, a);
        Assert.Equal("1,2,3,4,5,6,7,8", a);
    }

    [Fact]
    public void DiffersForDifferentDecks()
    {
        Assert.NotEqual(MetaCache.DeckKey([1, 2, 3]), MetaCache.DeckKey([1, 2, 4]));
    }
}
