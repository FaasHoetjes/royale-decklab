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

    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    private static SpaPage Resolve(string path) => SpaPages.Resolve(path, Cards, Stats, Now);

    [Theory]
    [InlineData("/", "/")]
    [InlineData("/best-decks", "/best-decks")]
    [InlineData("/FAQ/", "/faq")]
    [InlineData("/cards", "/cards")]
    [InlineData("/cards/mega-knight", "/cards/mega-knight")]
    [InlineData("/cards/Mega-Knight", "/cards/mega-knight")]
    [InlineData("/clan", "/clan")]
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

    [Fact]
    public void SharedLineup_NamesThePlayerAndKeepsTheCodeInTheLink()
    {
        var code = $"{new string('a', 16)}.{new string('b', 16)}";
        var page = SpaPages.SharedLineup(Resolve("/2qgg92l9"), "Faas", code);

        Assert.Equal("Faas's war decks · Royale DeckLab", page.Title);
        Assert.StartsWith("Two Clash Royale war decks picked for Faas's cards.", page.Description);
        Assert.Equal($"/2qgg92l9?share={code}", page.CanonicalPath);
        Assert.Equal($"/api/player/2QGG92L9/share-image?share={code}", page.ImagePath);
        Assert.True(page.NoIndex);
    }

    [Fact]
    public void Render_SwapsInTheSharedLineupsImage()
    {
        const string code = "000a0uc6cao9oaof";
        var html = SpaPages.Render(File.ReadAllText(IndexHtmlPath()), SpaPages.SharedLineup(Resolve("/2QGG92L9"), "Faas", code));

        Assert.Equal(2, Count(html, $"content=\"https://royaledecklab.com/api/player/2QGG92L9/share-image?share={code}\""));
        Assert.Contains("<meta property=\"og:image:width\" content=\"1200\" />", html);
        Assert.Contains("<meta property=\"og:image:height\" content=\"630\" />", html);
        Assert.Contains("<meta property=\"og:image:alt\" content=\"Faas&#39;s war decks &#183; Royale DeckLab\" />", html);
        Assert.DoesNotContain("og-image.png", html);
    }

    [Fact]
    public void Render_KeepsTheSiteImageElsewhere()
        => Assert.Equal(2, Count(SpaPages.Render(File.ReadAllText(IndexHtmlPath()), Resolve("/cards")), "og-image.png"));

    [Fact]
    public void SharedLineup_WithoutAName_StaysGeneric()
        => Assert.Equal("Shared war decks · Royale DeckLab", SpaPages.SharedLineup(Resolve("/2QGG92L9"), null, new string('a', 16)).Title);

    [Fact]
    public void ClanPage_IsServedUnderItsTagButNotIndexed()
    {
        var page = Resolve("/clan/l9vrj");
        Assert.Equal(200, page.StatusCode);
        Assert.Equal("/clan/L9VRJ", page.CanonicalPath);
        Assert.True(page.NoIndex);
    }

    [Fact]
    public void PlayerPage_CarriesItsTag()
    {
        Assert.Equal("#2QGG92L9", Resolve("/2qgg92l9").PlayerTag);
        Assert.Null(Resolve("/faq").PlayerTag);
    }

    [Theory]
    [InlineData("0123456789abcdef", true)]
    [InlineData("0102030405060708.090a0b0c0d0e0f0g.0h0i0j0k0l0m0n0o.0p0q0r0s0t0u0v0w", true)]
    [InlineData("0102030405060708.090a0b0c0d0e0f0g.0h0i0j0k0l0m0n0o.0p0q0r0s0t0u0v0w.0x0y0z1011121314", false)]
    [InlineData("0123456789abcdef.0123456789abcdef", false)]
    [InlineData("0123456789ABCDEF", false)]
    [InlineData("0123456789abcde", false)]
    [InlineData("0123456789abcdef\"><script>", false)]
    [InlineData("", false)]
    public void ShareCodes_AreCheckedBeforeTheyReachTheHead(string code, bool valid)
        => Assert.Equal(valid, SpaPages.IsShareCode(code));

    [Theory]
    [InlineData("/not-a-tag")]
    [InlineData("/faq/extra")]
    [InlineData("/2QGG92L9/extra")]
    [InlineData("/cards/no-such-card")]
    [InlineData("/cards/mega-knight/extra")]
    [InlineData("/clan/not-a-tag")]
    [InlineData("/clan/L9VRJ/extra")]
    [InlineData("/assets/missing.js")]
    public void UnknownPaths_Are404(string path)
        => Assert.Equal(404, Resolve(path).StatusCode);

    [Fact]
    public void CardPage_WithoutACatalog_IsStillServed()
        => Assert.Equal(200, SpaPages.Resolve("/cards/anything", [], [], Now).StatusCode);

    [Fact]
    public void CardPage_NamesTheCardAndItsNumbers()
    {
        var page = Resolve("/cards/mega-knight");
        Assert.Equal("Best Mega Knight Decks for Clash Royale War (November 2026)", page.Title);
        Assert.Equal(
            "The best Mega Knight decks for Clash Royale Clan War, ranked on real war battles: 52.3% win rate, 8.1% play rate and its change since the last balance update.",
            page.Description);
    }

    [Fact]
    public void CardPage_HeadCarriesItsBreadcrumb()
    {
        var html = SpaPages.Render("<head>\n  </head><body></body>", Resolve("/cards/mini-pekka"));
        Assert.Contains("<script type=\"application/ld+json\">", html);
        Assert.Contains("\"@type\":\"BreadcrumbList\"", html);
        Assert.Contains("\"name\":\"Mini P.E.K.K.A\",\"item\":\"https://royaledecklab.com/cards/mini-pekka\"", html);
    }

    [Fact]
    public void OtherPages_HaveNoStructuredData()
        => Assert.Null(Resolve("/best-decks").StructuredData);

    [Fact]
    public void BestDecks_NamesTheCurrentMonth()
        => Assert.Equal("Best Clash Royale War Decks (November 2026) · Royale DeckLab", Resolve("/best-decks").Title);

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

        Assert.Contains("<title>Best Mega Knight Decks for Clash Royale War (November 2026)</title>", html);
        Assert.Equal(2, Count(html, "content=\"Best Mega Knight Decks for Clash Royale War (November 2026)\""));
        Assert.Contains("<script type=\"application/ld+json\">", html);
        Assert.Equal(3, Count(html, "content=\"The best Mega Knight decks for Clash Royale Clan War, ranked on real war battles: 52.3% win rate"));
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
        Assert.Contains("<loc>https://royaledecklab.com/clan</loc>", xml);
        Assert.Equal(9, Count(xml, "<loc>"));
    }

    private static int Count(string text, string value) => text.Split(value).Length - 1;

    private static string IndexHtmlPath([CallerFilePath] string thisFile = "")
        => Path.GetFullPath(Path.Combine(Path.GetDirectoryName(thisFile)!, "..", "..", "client", "index.html"));
}
