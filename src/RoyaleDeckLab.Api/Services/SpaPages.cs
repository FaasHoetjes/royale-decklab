using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record SpaPage(int StatusCode, string Title, string Description, string? CanonicalPath, bool NoIndex, string? PlayerTag = null)
{
    /// <summary>The link preview image, when the page has its own instead of the site's.</summary>
    public string? ImagePath { get; init; }

    /// <summary>What <see cref="SpaContent"/> writes into the page for crawlers, and the h1 it gives it.</summary>
    public SpaContentKind Content { get; init; }
    public string? Heading { get; init; }
    public CatalogCard? Card { get; init; }

    /// <summary>schema.org JSON-LD for the head, such as the breadcrumb Google shows above a card page's result.</summary>
    public string? StructuredData { get; init; }

    /// <summary>The page's content as HTML for #root, once it's been written.</summary>
    public string? Body { get; init; }
}

public enum SpaContentKind { None, Home, BestDecks, Cards, Card, Builder, Upgrades, Clan, Faq }

/// <summary>
/// The status and head tags the server sends with index.html for each route, so crawlers and link previews that
/// never run the app's JavaScript still see each page's own title and description. Mirrors the routes in
/// client/src/main.tsx and the titles in client/src/components/navItems.tsx and CardPage.tsx.
/// </summary>
public static partial class SpaPages
{
    public const string Origin = "https://royaledecklab.com";
    private const string SiteName = "Royale DeckLab";
    private const string SiteDescription = "Generate your best four Clash Royale War Decks tuned to the cards you actually own.";
    private const string CardsPath = "/cards";
    private const string ClanPath = "/clan";
    private const string AdminStatsPath = "/admin/stats";

    /// <summary>Heading is the page's h1 as the app shows it.</summary>
    private static (string Path, string Title, string Heading, string Description, SpaContentKind Content)[] StaticPages(DateTimeOffset now) =>
    [
        ("/best-decks", $"Best Clash Royale War Decks ({MonthYear(now)})", "Best War Deck Sets", "The strongest four-deck Clash Royale war sets right now, ranked on Clan War battles from the top 100 war clans.", SpaContentKind.BestDecks),
        (CardsPath, "Clash Royale Card Win Rates in Clan War", "Cards", "How every Clash Royale card does in Clan War right now: win rate, play rate, the change since the last balance update and its best war decks.", SpaContentKind.Cards),
        ("/builder", "Clash Royale War Deck Builder", "War Deck Builder", "Build four Clash Royale war decks with no shared cards, or rate a single deck, and see how each one scores in the current war meta.", SpaContentKind.Builder),
        ("/upgrades", "What to Upgrade Next in Clash Royale", "Upgrade Advisor", "Find the card upgrade that raises your Clash Royale war lineup the most.", SpaContentKind.Upgrades),
        (ClanPath, "Clash Royale Clan War Planner", "Clan War Planner", "See who in your Clash Royale clan still has war decks to play today, and give every member their best four war decks.", SpaContentKind.Clan),
        ("/faq", "Clash Royale War Deck FAQ", "FAQ", "How Royale DeckLab picks and scores Clash Royale war decks, and where its data comes from.", SpaContentKind.Faq),
    ];

    private static readonly SpaPage Home = new(200, $"{SiteName}: your best Clash Royale war decks", SiteDescription, "/", false)
    {
        Content = SpaContentKind.Home,
        Heading = SiteName,
    };
    private static readonly SpaPage NotFound = new(404, SiteName, SiteDescription, null, false);

    public static bool IsCardPath(string? path) => path?.StartsWith(CardsPath + "/", StringComparison.OrdinalIgnoreCase) == true;

    public static SpaPage Resolve(string? rawPath, IReadOnlyList<CatalogCard> cards, IReadOnlyList<CardStat> stats, DateTimeOffset now)
    {
        var path = "/" + (rawPath ?? "").Trim('/');
        if (path == "/")
        {
            return Home;
        }
        foreach (var page in StaticPages(now))
        {
            if (string.Equals(path, page.Path, StringComparison.OrdinalIgnoreCase))
            {
                return new(200, $"{page.Title} · {SiteName}", page.Description, page.Path, false)
                {
                    Content = page.Content,
                    Heading = page.Heading,
                };
            }
        }
        if (IsCardPath(path))
        {
            return CardPage(path[(CardsPath.Length + 1)..], cards, stats, now);
        }
        // The stats page holds no data until the admin token is entered; it just shouldn't be found.
        if (string.Equals(path, AdminStatsPath, StringComparison.OrdinalIgnoreCase))
        {
            return new(200, $"Stats · {SiteName}", SiteDescription, null, true);
        }
        if (IsClanPagePath(path, out var clanTag))
        {
            return new(200, $"Clan War Planner · {SiteName}", "See who in this clan still has war decks to play today.", $"{ClanPath}/{clanTag}", true);
        }
        var segment = path[1..];
        // Player pages are endless and differ only in whose cards they use, so they stay shareable but unindexed.
        if (!segment.Contains('/') && PlayerTag.IsValid(segment))
        {
            return new(200, $"War Deck Generator · {SiteName}", SiteDescription, path, true, "#" + segment.ToUpperInvariant());
        }
        return NotFound;
    }

    /// <summary>A clan's own page: shareable in the clan chat, but one per clan, so it stays unindexed.</summary>
    private static bool IsClanPagePath(string path, out string clanTag)
    {
        clanTag = "";
        if (!path.StartsWith(ClanPath + "/", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        if (!ClanTag.TryParse(path[(ClanPath.Length + 1)..], out var tag))
        {
            return false;
        }
        clanTag = tag.Value.TrimStart('#');
        return true;
    }

    public static bool IsShareCode(string? code) => ShareCode.TryDecode(code, out _);

    /// <summary>
    /// A player page opened from a share link names whose decks they are, and keeps the code in og:url, which
    /// Discord links the preview's title to.
    /// </summary>
    public static SpaPage SharedLineup(SpaPage playerPage, string? playerName, string shareCode)
    {
        var count = shareCode.Split('.').Length;
        var decks = count switch { 1 => "One Clash Royale war deck", 2 => "Two Clash Royale war decks", 3 => "Three Clash Royale war decks", _ => "Four Clash Royale war decks" };
        return playerPage with
        {
            Title = playerName is null ? $"Shared war decks · {SiteName}" : $"{playerName}'s war decks · {SiteName}",
            Description = $"{decks} picked for {(playerName is null ? "a player" : playerName + "'s")} cards. Get the best war decks for your own cards on {SiteName}.",
            CanonicalPath = $"{playerPage.CanonicalPath}?share={shareCode}",
            ImagePath = $"/api/player/{playerPage.PlayerTag?.TrimStart('#')}/share-image?share={shareCode}",
        };
    }

    private static SpaPage CardPage(string slug, IReadOnlyList<CatalogCard> cards, IReadOnlyList<CardStat> stats, DateTimeOffset now)
    {
        if (slug.Contains('/'))
        {
            return NotFound;
        }
        // Without a catalog the slug can't be checked, and a real card page shouldn't 404 while the API is down.
        if (cards.Count == 0)
        {
            var (_, title, _, description, _) = StaticPages(now).First(p => p.Path == CardsPath);
            return new(200, $"{title} · {SiteName}", description, $"{CardsPath}/{slug}", false);
        }
        var card = cards.FirstOrDefault(c => string.Equals(CardSlug(c.Name), slug, StringComparison.OrdinalIgnoreCase));
        if (card is null)
        {
            return NotFound;
        }
        var stat = stats.FirstOrDefault(s => s.Id == card.Id);
        var numbers = stat is null
            ? "its win rate, play rate and change"
            : $"{Percent(stat.WinRate)} win rate, {Percent(stat.PlayRate)} play rate and its change";
        return new(
            200,
            CardTitle(card.Name, now),
            $"The best {card.Name} decks for Clash Royale Clan War, ranked on real war battles: {numbers} since the last balance update.",
            $"{CardsPath}/{CardSlug(card.Name)}",
            false)
        {
            Content = SpaContentKind.Card,
            Heading = $"{card.Name} Decks",
            Card = card,
            StructuredData = Breadcrumb([(SiteName, "/"), ("Cards", CardsPath), (card.Name, $"{CardsPath}/{CardSlug(card.Name)}")]),
        };
    }

    // Worded the way people search ("royal giant deck"), without the site name so the card fits before Google cuts it off.
    private static string CardTitle(string cardName, DateTimeOffset now)
        => $"Best {cardName} Decks for Clash Royale War ({MonthYear(now)})";

    private static string MonthYear(DateTimeOffset now) => now.ToString("MMMM yyyy", CultureInfo.InvariantCulture);

    // The serializer escapes < and >, so a name can't close the script tag.
    private static string Breadcrumb(IReadOnlyList<(string Name, string Path)> trail)
        => JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "BreadcrumbList",
            ["itemListElement"] = trail.Select((step, i) => new Dictionary<string, object>
            {
                ["@type"] = "ListItem",
                ["position"] = i + 1,
                ["name"] = step.Name,
                ["item"] = Origin + step.Path,
            }),
        });

    internal static string Percent(double share) => (share * 100).ToString("0.0", CultureInfo.InvariantCulture) + "%";

    /// <summary>Matches cardSlug in client/src/lib/cardInfo.ts.</summary>
    public static string CardSlug(string name)
        => NonAlphanumericRegex().Replace(name.ToLowerInvariant().Replace(".", "").Replace("'", ""), "-").Trim('-');

    public static string Render(string indexHtml, SpaPage page)
    {
        var title = WebUtility.HtmlEncode(page.Title);
        var description = WebUtility.HtmlEncode(page.Description);
        var html = indexHtml.Replace($"<title>{SiteName}</title>", $"<title>{title}</title>");
        html = TitleMetaRegex().Replace(html, m => m.Groups[1].Value + title);
        html = DescriptionMetaRegex().Replace(html, m => m.Groups[1].Value + description);
        if (page.CanonicalPath is { } canonicalPath)
        {
            var url = WebUtility.HtmlEncode(Origin + canonicalPath);
            html = html.Replace(
                $"<meta property=\"og:url\" content=\"{Origin}/\" />",
                $"<meta property=\"og:url\" content=\"{url}\" />\n    <link rel=\"canonical\" href=\"{url}\" />");
        }
        if (page.ImagePath is { } imagePath)
        {
            html = html
                .Replace($"content=\"{Origin}/og-image.png\"", $"content=\"{WebUtility.HtmlEncode(Origin + imagePath)}\"")
                .Replace("property=\"og:image:width\" content=\"2400\"", $"property=\"og:image:width\" content=\"{ShareImageRenderer.Width}\"")
                .Replace("property=\"og:image:height\" content=\"1260\"", $"property=\"og:image:height\" content=\"{ShareImageRenderer.Height}\"")
                .Replace("property=\"og:image:alt\" content=\"Royale DeckLab\"", $"property=\"og:image:alt\" content=\"{title}\"");
        }
        if (page.StructuredData is { } structuredData)
        {
            html = html.Replace("</head>", $"  <script type=\"application/ld+json\">{structuredData}</script>\n  </head>");
        }
        if (page.Body is { } body)
        {
            html = html.Replace("<div id=\"root\"></div>", $"<div id=\"root\">{body}</div>");
        }
        return html;
    }

    public static string Sitemap(IEnumerable<CatalogCard> cards)
    {
        var paths = StaticPages(DateTimeOffset.UnixEpoch).Select(p => p.Path)
            .Prepend("/")
            .Concat(cards.Select(c => $"{CardsPath}/{CardSlug(c.Name)}").Order(StringComparer.Ordinal))
            .Distinct();
        var xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        foreach (var path in paths)
        {
            xml.Append("  <url><loc>").Append(WebUtility.HtmlEncode(Origin + path)).Append("</loc></url>\n");
        }
        return xml.Append("</urlset>\n").ToString();
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonAlphanumericRegex();

    [GeneratedRegex("""((?:property|name)="(?:og:title|twitter:title)"\s+content=")[^"]*""")]
    private static partial Regex TitleMetaRegex();

    [GeneratedRegex("""((?:property|name)="(?:description|og:description|twitter:description)"\s+content=")[^"]*""")]
    private static partial Regex DescriptionMetaRegex();
}
