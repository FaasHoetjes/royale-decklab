using System.Runtime.CompilerServices;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class SpaPagesTests
{
    private static readonly CatalogCard[] Cards =
    [
        new(1, "Mega Knight", 11, null, 7, "legendary", null),
        new(2, "Mini P.E.K.K.A", 14, null, 4, "rare", null),
    ];

    private static readonly CardStat[] Stats = [new(1, 500, 0.5234, 0.081, 0, 0, 0, null, null, null, null, false)];

    private static SpaPage Resolve(string path) => SpaPages.Resolve(path, Cards, Stats);

    [Theory]
    [InlineData("/", "/")]
    [InlineData("/best-decks", "/best-decks")]
    [InlineData("/FAQ/", "/faq")]
    [InlineData("/cards", "/cards")]
    [InlineData("/cards/mega-knight", "/cards/mega-knight")]
    public void KnownPages_AreIndexedUnderTheirOwnPath(string path, string canonical)
    {
        var page = Resolve(path);
        Assert.Equal(200, page.StatusCode);
        Assert.Equal(canonical, page.CanonicalPath);
        Assert.False(page.NoIndex);
    }

    [Fact]
    public void PlayerPage_IsServedButNotIndexed()
    {
        var page = Resolve("/2QGG92L9");
        Assert.Equal(200, page.StatusCode);
        Assert.True(page.NoIndex);
    }

    [Theory]
    [InlineData("/not-a-tag")]
    [InlineData("/faq/extra")]
    [InlineData("/2QGG92L9/extra")]
    [InlineData("/cards/no-such-card")]
    [InlineData("/cards/mega-knight/extra")]
    [InlineData("/assets/missing.js")]
    public void UnknownPaths_Are404(string path)
        => Assert.Equal(404, Resolve(path).StatusCode);

    [Fact]
    public void CardPage_WithoutACatalog_IsStillServed()
        => Assert.Equal(200, SpaPages.Resolve("/cards/anything", [], []).StatusCode);

    [Fact]
    public void CardPage_NamesTheCardAndItsNumbers()
    {
        var page = Resolve("/cards/mega-knight");
        Assert.Equal("Mega Knight · Cards · Royale DeckLab", page.Title);
        Assert.StartsWith("Mega Knight in Clash Royale Clan War: 52.3% win rate, 8.1% play rate, ", page.Description);
    }

    [Theory]
    [InlineData("Mini P.E.K.K.A", "mini-pekka")]
    [InlineData("X-Bow", "x-bow")]
    [InlineData("Royal Giant", "royal-giant")]
    public void CardSlug_MatchesTheClient(string name, string slug)
        => Assert.Equal(slug, SpaPages.CardSlug(name));

    [Fact]
    public void Render_FillsEveryHeadTagInTheRealIndexHtml()
    {
        var html = SpaPages.Render(File.ReadAllText(IndexHtmlPath()), Resolve("/cards/mega-knight"));

        Assert.Contains("<title>Mega Knight &#183; Cards &#183; Royale DeckLab</title>", html);
        Assert.Equal(2, Count(html, "content=\"Mega Knight &#183; Cards &#183; Royale DeckLab\""));
        Assert.Equal(3, Count(html, "content=\"Mega Knight in Clash Royale Clan War: 52.3% win rate"));
        Assert.Contains("<meta property=\"og:url\" content=\"https://royaledecklab.com/cards/mega-knight\" />", html);
        Assert.Contains("<link rel=\"canonical\" href=\"https://royaledecklab.com/cards/mega-knight\" />", html);
        Assert.Contains("<meta property=\"og:site_name\" content=\"Royale DeckLab\" />", html);
    }

    [Fact]
    public void Sitemap_ListsThePagesAndEveryCard()
    {
        var xml = SpaPages.Sitemap(Cards);
        Assert.Contains("<loc>https://royaledecklab.com/</loc>", xml);
        Assert.Contains("<loc>https://royaledecklab.com/best-decks</loc>", xml);
        Assert.Contains("<loc>https://royaledecklab.com/cards/mini-pekka</loc>", xml);
        Assert.Equal(8, Count(xml, "<loc>"));
    }

    private static int Count(string text, string value) => text.Split(value).Length - 1;

    private static string IndexHtmlPath([CallerFilePath] string thisFile = "")
        => Path.GetFullPath(Path.Combine(Path.GetDirectoryName(thisFile)!, "..", "..", "client", "index.html"));
}
