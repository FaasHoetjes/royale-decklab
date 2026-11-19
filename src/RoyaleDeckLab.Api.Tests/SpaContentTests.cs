using System.Runtime.CompilerServices;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class SpaContentTests
{
    private static readonly CatalogCard MegaKnight = new(1, "Mega Knight", 11, null, 7, "legendary", null);
    private static readonly CatalogCard MiniPekka = new(2, "Mini P.E.K.K.A", 14, null, 4, "rare", null);
    private static readonly CardStat MegaKnightStat = new(1, 1500, 0.5234, 0.081, 0, 0, 0, null, null, null, null, false);
    private static readonly CardStatsResponse Stats = new(null, null, 1000, false, [MegaKnightStat]);

    private static readonly (string Name, int Cost)[] Inferno =
        [("Knight", 3), ("Skeleton Army", 3), ("Princess", 3), ("Dart Goblin", 3), ("Wall Breakers", 2), ("Inferno Tower", 5), ("Goblin Barrel", 3), ("The Log", 2)];
    private static readonly (string Name, int Cost)[] BombTower =
        [("Knight", 3), ("Skeleton Army", 3), ("Princess", 3), ("Ice Spirit", 1), ("Dart Goblin", 3), ("Wall Breakers", 2), ("Bomb Tower", 4), ("Goblin Barrel", 3)];
    private static readonly (string Name, int Cost)[] Hog =
        [("Goblins", 2), ("Hog Rider", 4), ("Firecracker", 3), ("Mighty Miner", 4), ("Electro Spirit", 1), ("Cannon", 3), ("The Log", 2), ("Earthquake", 3)];

    [Fact]
    public void DistinctNames_TellTwinsApartLikeTheClient()
    {
        IReadOnlyList<(string, int?)> Named((string Name, int Cost)[] deck) => deck.Select(c => (c.Name, (int?)c.Cost)).ToList();

        Assert.Equal(["Log Bait", "Hog EQ"], DeckArchetypes.DistinctNames([Named(Inferno), Named(Hog)]));
        Assert.Equal(
            ["Log Bait · Inferno Tower", "Log Bait · Bomb Tower", "Hog EQ"],
            DeckArchetypes.DistinctNames([Named(Inferno), Named(BombTower), Named(Hog)]));
    }

    [Fact]
    public void CardPage_HasTheCardsNumbersAndDecksWithLinks()
    {
        var html = SpaContent.Card(MegaKnight, MegaKnightStat, true, [Entry(Inferno, 0.55), Entry(BombTower, 0.53)]);

        Assert.Contains("<h1>Mega Knight Decks</h1>", html);
        Assert.Contains("<p>7 elixir &#183; Legendary</p>", html);
        Assert.Contains("<p>52.3% win rate &#183; 8.1% use rate &#183; 1,500 games</p>", html);
        Assert.Contains("<h2>Best war decks with Mega Knight</h2>", html);
        Assert.Contains("<h3>Log Bait &#183; Inferno Tower</h3><p>55.0% win rate</p>", html);
        Assert.Contains("<a href=\"/cards/goblin-barrel\">Goblin Barrel</a>", html);
        Assert.Contains("<a href=\"/cards\">All cards</a>", html);
    }

    [Fact]
    public void CardPage_OpensWithItsTopDeck()
    {
        var html = SpaContent.Card(MegaKnight, MegaKnightStat, true, [Entry(Inferno, 0.55), Entry(BombTower, 0.53)]);

        Assert.Contains(
            "<h1>Mega Knight Decks</h1><p>Best Mega Knight war deck right now: Log Bait with Inferno Tower, Knight and Skeleton Army, 55.0% win rate in the top war clans.</p>",
            html);
    }

    [Fact]
    public void CardDescription_NamesTheTopDeckAndCountsTheRest()
        => Assert.Equal(
            "Best Mega Knight war deck right now: Log Bait with Inferno Tower, Knight and Skeleton Army, 55.0% win rate in the top war clans. Plus 2 more ranked war decks.",
            SpaPages.CardDescription("Mega Knight", MegaKnightStat, [Entry(Inferno, 0.55), Entry(BombTower, 0.53), Entry(Hog, 0.51)]));

    [Fact]
    public void CardDescription_FitsTheSnippet()
    {
        (string, int)[] pricey = [("Elite Barbarians", 6), ("Elixir Collector", 6), ("Royal Recruits", 7), ("Goblin Giant", 6), ("Mini P.E.K.K.A", 4), ("Barbarian Barrel", 2), ("Giant Snowball", 2), ("Electro Spirit", 1)];

        var description = SpaPages.CardDescription("Mini P.E.K.K.A", null, [Entry(pricey, 0.5), Entry(pricey, 0.5), Entry(pricey, 0.5)]);

        Assert.True(description.Length <= 160, description);
        Assert.StartsWith("Best Mini P.E.K.K.A war deck right now:", description);
    }

    [Fact]
    public void PatchPage_ListsTheBalanceChangesAndTheBiggestMovers()
    {
        var steady = new CardStat(1, 5000, 0.51, 0.08, 0, 0, 5000, 0.505, 0.081, 0.005, 0.02, false);
        var nerfed = new CardStat(2, 5000, 0.46, 0.05, 0, 0, 5000, 0.50, 0.07, -0.04, 0.02, true);
        var stats = new CardStatsResponse("2026-11-02T09:32:46.298Z", null, 60_000, false, [steady, nerfed], "2026-10-05T09:00:00.000Z");
        var update = new BalanceUpdate(new DateOnly(2026, 10, 19), "https://supercell.com/x", [new BalanceChange(2, CardVersionKind.Normal, BalanceChangeKind.Nerf, "Damage 212 → 202")]);

        var html = SpaContent.Patch([MegaKnight, MiniPekka], stats, [update]);

        Assert.Contains("<h1>October Patch</h1>", html);
        Assert.Contains("<h2>Balance changes, October 19</h2><ul><li><a href=\"/cards/mini-pekka\">Mini P.E.K.K.A</a> (nerf): Damage 212 → 202</li></ul>", html);
        Assert.Contains("<h2>Biggest use rate changes</h2><ul><li><a href=\"/cards/mini-pekka\">Mini P.E.K.K.A</a>: 7.0% → 5.0%</li><li><a href=\"/cards/mega-knight\">", html);
        Assert.Contains("<h2>Biggest win rate changes</h2><ul><li><a href=\"/cards/mini-pekka\">Mini P.E.K.K.A</a>: 50.0% → 46.0%</li></ul>", html);
        Assert.Contains("<a href=\"/patch\">Patch Overview</a>", html);
    }

    [Fact]
    public void PatchPage_IsNamedForItsNewestBalanceUpdate_NotWhenThePatchBegan()
    {
        var stats = new CardStatsResponse("2026-11-02T09:32:46.298Z", null, 60_000, false, [MegaKnightStat], "2026-10-05T09:00:00.000Z");
        BalanceUpdate On(int month, int day) => new(new DateOnly(2026, month, day), "https://supercell.com/x", []);

        Assert.Equal("October Patch", SpaContent.PatchHeading(stats, [On(10, 6), On(10, 19)]));
        Assert.Equal("November Patch", SpaContent.PatchHeading(stats, []));
    }

    [Fact]
    public void PatchPage_WhileOnlyLastPatchIsIn_IsNamedForTheNewPatch()
    {
        var stats = new CardStatsResponse("2026-10-05T09:00:00.000Z", "2026-11-02T09:32:46.298Z", 60_000, true, [MegaKnightStat]);

        var html = SpaContent.Patch([MegaKnight], stats, []);

        Assert.Contains("<h1>November Patch</h1>", html);
        Assert.DoesNotContain("Biggest", html);
    }

    [Fact]
    public void CardPage_SaysSoWhenNobodyPlaysIt()
    {
        var html = SpaContent.Card(MiniPekka, null, true, []);
        Assert.Contains("Nobody in the top war clans has played Mini P.E.K.K.A in a war battle this patch.", html);
        Assert.Contains("No war deck with Mini P.E.K.K.A has been played by five or more players yet", html);
    }

    [Fact]
    public void CardPage_BeforeTheMetaLoads_ClaimsNothing()
    {
        var html = SpaContent.Card(MiniPekka, null, false, []);
        Assert.Contains("<h1>Mini P.E.K.K.A Decks</h1>", html);
        Assert.DoesNotContain("Nobody", html);
        Assert.DoesNotContain("No war deck", html);
    }

    [Fact]
    public void CardsPage_LinksEveryCardMostPlayedFirst()
    {
        var html = SpaContent.Cards("Cards", [MiniPekka, MegaKnight], Stats);

        Assert.Contains("<tr><td><a href=\"/cards/mega-knight\">Mega Knight</a></td><td>52.3%</td><td>8.1%</td></tr>", html);
        Assert.Contains("<tr><td><a href=\"/cards/mini-pekka\">Mini P.E.K.K.A</a></td><td>–</td><td>–</td></tr>", html);
        Assert.True(html.IndexOf("mega-knight", StringComparison.Ordinal) < html.IndexOf("mini-pekka", StringComparison.Ordinal));
    }

    [Fact]
    public void BestDecks_NamesADeckTheSameInEverySet()
    {
        var inferno = Entry(Inferno, 0.55);
        var html = SpaContent.BestDecks("Best", [new([inferno, Entry(Hog, 0.52)], 2), new([inferno, Entry(BombTower, 0.51)], 1)]);

        Assert.Contains("<h2>Set 1</h2>", html);
        Assert.Contains("<h2>Set 2</h2>", html);
        Assert.Equal(2, html.Split("<h3>Log Bait &#183; Inferno Tower</h3>").Length - 1);
        Assert.Contains("<h3>Log Bait &#183; Bomb Tower</h3>", html);
    }

    [Fact]
    public void EveryPage_LinksTheMainPagesAndEncodesItsText()
    {
        var html = SpaContent.Builder("Build <yours>");
        Assert.StartsWith("<div id=\"prerender\"><nav>", html);
        Assert.Contains("<a href=\"/best-decks\">Best War Decks</a>", html);
        Assert.Contains("<h1>Build &lt;yours&gt;</h1>", html);
    }

    [Fact]
    public void Render_PutsTheBodyInTheRootOfTheRealIndexHtml()
    {
        var page = SpaPages.Resolve("/faq", [], [], DateTimeOffset.UnixEpoch);
        var html = SpaPages.Render(File.ReadAllText(IndexHtmlPath()), page with { Body = SpaContent.Faq(page.Heading!, "<h2>Q</h2>") });

        Assert.Contains("<div id=\"root\"><div id=\"prerender\">", html);
        Assert.Contains("<h1>FAQ</h1><h2>Q</h2>", html);
    }

    [Fact]
    public void IndexHtml_HidesTheBodyOnceScriptsRun()
    {
        Assert.Contains(".js #prerender", File.ReadAllText(IndexHtmlPath()));
        Assert.Contains("classList.add('js')", File.ReadAllText(Path.Combine(Path.GetDirectoryName(IndexHtmlPath())!, "public", "theme-init.js")));
    }

    [Theory]
    [InlineData("/", "Royale DeckLab")]
    [InlineData("/best-decks", "Best War Deck Sets")]
    [InlineData("/cards", "Cards")]
    [InlineData("/faq", "FAQ")]
    public void Pages_HeadTheirContentLikeTheApp(string path, string heading)
        => Assert.Equal(heading, SpaPages.Resolve(path, [], [], DateTimeOffset.UnixEpoch).Heading);

    [Fact]
    public void PlayerAndMissingPages_GetNoBody()
    {
        Assert.Equal(SpaContentKind.None, SpaPages.Resolve("/2QGG92L9", [], [], DateTimeOffset.UnixEpoch).Content);
        Assert.Equal(SpaContentKind.None, SpaPages.Resolve("/nope/nope", [], [], DateTimeOffset.UnixEpoch).Content);
    }

    private static BestDeckEntry Entry((string Name, int Cost)[] deck, double winRate)
    {
        var cards = deck.Select(c => new BestDeckCard(CardId(c.Name), c.Name, 14, c.Cost, "common", null)).ToList();
        return new(cards.Select(c => c.Id).ToArray(), winRate, winRate, 100, 20, 0.01, winRate, [], cards);
    }

    private static readonly Dictionary<string, int> CardIds = [];

    private static int CardId(string name)
    {
        lock (CardIds)
        {
            return CardIds.TryGetValue(name, out var id) ? id : CardIds[name] = 100 + CardIds.Count;
        }
    }

    private static string IndexHtmlPath([CallerFilePath] string thisFile = "")
        => Path.GetFullPath(Path.Combine(Path.GetDirectoryName(thisFile)!, "..", "..", "client", "index.html"));
}
