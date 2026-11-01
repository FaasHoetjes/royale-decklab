using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record SpaPage(int StatusCode, string Title, string Description, string? CanonicalPath, bool NoIndex);

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

    private static readonly (string Path, string Label, string Description)[] StaticPages =
    [
        ("/best-decks", "Best War Decks", "The strongest four-deck Clash Royale war sets right now, ranked on Clan War battles from the top 100 war clans."),
        (CardsPath, "Cards", "How every Clash Royale card does in Clan War right now: win rate, play rate, the change since the last balance update and its best war decks."),
        ("/builder", "War Deck Builder", "Build four Clash Royale war decks with no shared cards and see how each one scores in the current war meta."),
        ("/upgrades", "Upgrade Advisor", "Find the card upgrade that raises your Clash Royale war lineup the most."),
        ("/faq", "FAQ", "How Royale DeckLab picks and scores Clash Royale war decks, and where its data comes from."),
    ];

    private static readonly SpaPage Home = new(200, $"{SiteName}: your best Clash Royale war decks", SiteDescription, "/", false);
    private static readonly SpaPage NotFound = new(404, SiteName, SiteDescription, null, false);

    public static bool IsCardPath(string? path) => path?.StartsWith(CardsPath + "/", StringComparison.OrdinalIgnoreCase) == true;

    public static SpaPage Resolve(string? rawPath, IReadOnlyList<CatalogCard> cards, IReadOnlyList<CardStat> stats)
    {
        var path = "/" + (rawPath ?? "").Trim('/');
        if (path == "/")
        {
            return Home;
        }
        foreach (var page in StaticPages)
        {
            if (string.Equals(path, page.Path, StringComparison.OrdinalIgnoreCase))
            {
                return new(200, $"{page.Label} · {SiteName}", page.Description, page.Path, false);
            }
        }
        if (IsCardPath(path))
        {
            return CardPage(path[(CardsPath.Length + 1)..], cards, stats);
        }
        var segment = path[1..];
        // Player pages are endless and differ only in whose cards they use, so they stay shareable but unindexed.
        if (!segment.Contains('/') && PlayerTag.IsValid(segment))
        {
            return new(200, $"War Deck Generator · {SiteName}", SiteDescription, path, true);
        }
        return NotFound;
    }

    private static SpaPage CardPage(string slug, IReadOnlyList<CatalogCard> cards, IReadOnlyList<CardStat> stats)
    {
        if (slug.Contains('/'))
        {
            return NotFound;
        }
        // Without a catalog the slug can't be checked, and a real card page shouldn't 404 while the API is down.
        if (cards.Count == 0)
        {
            var (_, label, description) = StaticPages.First(p => p.Path == CardsPath);
            return new(200, $"{label} · {SiteName}", description, $"{CardsPath}/{slug}", false);
        }
        var card = cards.FirstOrDefault(c => CardSlug(c.Name) == slug);
        if (card is null)
        {
            return NotFound;
        }
        var stat = stats.FirstOrDefault(s => s.Id == card.Id);
        var numbers = stat is null ? "" : $"{Percent(stat.WinRate)} win rate, {Percent(stat.PlayRate)} play rate, ";
        return new(
            200,
            $"{card.Name} · Cards · {SiteName}",
            $"{card.Name} in Clash Royale Clan War: {numbers}its change since the last balance update and its best war decks.",
            $"{CardsPath}/{slug}",
            false);
    }

    private static string Percent(double share) => (share * 100).ToString("0.0", CultureInfo.InvariantCulture) + "%";

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
        return html;
    }

    public static string Sitemap(IEnumerable<CatalogCard> cards)
    {
        var paths = StaticPages.Select(p => p.Path)
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
