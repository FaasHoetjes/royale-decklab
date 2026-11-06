using System.Globalization;
using System.Net;
using System.Text;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Each page's content as plain HTML inside #root, for crawlers that read the HTML without running the app: Bing,
/// ChatGPT search, DuckDuckGo and the AI crawlers. theme-init.js hides it from visitors until the app replaces it.
/// Mirrors what the pages in client/src/pages show.
/// </summary>
public static class SpaContent
{
    private static readonly (string Path, string Label)[] Nav =
    [
        ("/", "War Deck Generator"),
        ("/best-decks", "Best War Decks"),
        ("/cards", "Cards"),
        ("/builder", "War Deck Builder"),
        ("/upgrades", "Upgrade Advisor"),
        ("/clan", "Clan War Planner"),
        ("/faq", "FAQ"),
    ];

    public static string Home(string heading)
        => Page($"{H1(heading)}{P("Your best four war decks, from the cards you own.")}");

    public static string Builder(string heading)
        => Page($"{H1(heading)}{P("Build four war decks that don't share a card.")}");

    public static string Upgrades(string heading)
        => Page($"{H1(heading)}{P("Which card upgrade raises your war lineup the most.")}");

    public static string Clan(string heading)
        => Page($"{H1(heading)}{P("Who in your clan still has war decks to play today, and each member's best four war decks.")}");

    /// <summary>The FAQ's questions and answers, rendered from client/src/pages/faqContent.tsx at build time.</summary>
    public static string Faq(string heading, string? faqHtml)
        => Page($"{H1(heading)}{faqHtml}");

    public static string BestDecks(string heading, IReadOnlyList<BestDeckSet> sets)
    {
        var html = new StringBuilder(H1(heading))
            .Append(P("The strongest four deck war sets in the current meta. Assumes a maxed collection with all Evolutions and Heroes."));
        // A deck can show up in several sets; like the page, it keeps one name across all of them.
        var unique = sets.SelectMany(s => s.Decks).DistinctBy(d => MetaCache.DeckKey(d.CardIds)).ToList();
        var names = DeckNames(unique);
        var nameOf = unique
            .Select((d, i) => (Key: MetaCache.DeckKey(d.CardIds), Name: names[i]))
            .ToDictionary(x => x.Key, x => x.Name);
        for (var i = 0; i < sets.Count; i++)
        {
            html.Append("<section>").Append(H2($"Set {i + 1}"))
                .Append(DeckList(sets[i].Decks.Select(d => (d, nameOf[MetaCache.DeckKey(d.CardIds)]))))
                .Append("</section>");
        }
        return Page(html.ToString());
    }

    public static string Cards(string heading, IReadOnlyList<CatalogCard> cards, CardStatsResponse stats)
    {
        var html = new StringBuilder(H1(heading)).Append(P("How every card does in Clan War."));
        if (cards.Count > 0)
        {
            var statById = stats.Cards.ToDictionary(s => s.Id);
            html.Append("<table><thead><tr><th>Card</th><th>Win rate</th><th>Play rate</th></tr></thead><tbody>");
            var ordered = cards
                .OrderByDescending(c => statById.GetValueOrDefault(c.Id)?.PlayRate ?? -1)
                .ThenBy(c => c.Name, StringComparer.Ordinal);
            foreach (var card in ordered)
            {
                var stat = statById.GetValueOrDefault(card.Id);
                html.Append("<tr><td>").Append(CardLink(card.Name)).Append("</td><td>")
                    .Append(stat is null ? "–" : Percent(stat.WinRate)).Append("</td><td>")
                    .Append(stat is null ? "–" : Percent(stat.PlayRate)).Append("</td></tr>");
            }
            html.Append("</tbody></table>");
        }
        return Page(html.ToString());
    }

    public static string Card(CatalogCard card, CardStat? stat, bool statsLoaded, IReadOnlyList<BestDeckEntry> decks)
    {
        var html = new StringBuilder("<p><a href=\"/cards\">All cards</a></p>").Append(H1(card.Name));
        var facts = new[]
        {
            card.ElixirCost is { } cost ? $"{cost} elixir" : null,
            card.Rarity is { Length: > 0 } rarity ? char.ToUpperInvariant(rarity[0]) + rarity[1..] : null,
        }.OfType<string>().ToList();
        if (facts.Count > 0)
        {
            html.Append(P(string.Join(" · ", facts)));
        }
        if (stat is not null)
        {
            var games = stat.Games.ToString("N0", CultureInfo.InvariantCulture);
            html.Append(P($"{Percent(stat.WinRate)} win rate · {Percent(stat.PlayRate)} play rate · {games} games"));
        }
        else if (statsLoaded)
        {
            html.Append(P($"Nobody in the top war clans has played {card.Name} in a war battle this patch."));
        }
        html.Append(H2($"Best war decks with {card.Name}"));
        if (decks.Count > 0)
        {
            var names = DeckNames(decks);
            html.Append(DeckList(decks.Select((d, i) => (d, names[i]))));
        }
        else if (statsLoaded)
        {
            html.Append(P($"No war deck with {card.Name} has been played by five or more players yet, so there's none to rank."));
        }
        return Page(html.ToString());
    }

    private static IReadOnlyList<string> DeckNames(IEnumerable<BestDeckEntry> decks)
    {
        var cardLists = decks
            .Select(d => (IReadOnlyList<(string, int?)>)d.Cards.Select(c => (c.Name, c.ElixirCost)).ToList())
            .ToList();
        return DeckArchetypes.DistinctNames(cardLists);
    }

    private static string DeckList(IEnumerable<(BestDeckEntry Deck, string Name)> decks)
    {
        var html = new StringBuilder("<ul>");
        foreach (var (deck, name) in decks)
        {
            html.Append("<li>").Append(H3(name)).Append(P($"{Percent(deck.WinRate)} win rate")).Append("<ul>");
            foreach (var card in deck.Cards)
            {
                html.Append("<li>").Append(CardLink(card.Name)).Append("</li>");
            }
            html.Append("</ul></li>");
        }
        return html.Append("</ul>").ToString();
    }

    private static string Page(string main)
    {
        var html = new StringBuilder("<div id=\"prerender\"><nav><ul>");
        foreach (var (path, label) in Nav)
        {
            html.Append("<li><a href=\"").Append(path).Append("\">").Append(Encode(label)).Append("</a></li>");
        }
        return html.Append("</ul></nav><main>").Append(main).Append("</main></div>").ToString();
    }

    private static string CardLink(string name)
        => $"<a href=\"/cards/{SpaPages.CardSlug(name)}\">{Encode(name)}</a>";

    private static string H1(string text) => $"<h1>{Encode(text)}</h1>";
    private static string H2(string text) => $"<h2>{Encode(text)}</h2>";
    private static string H3(string text) => $"<h3>{Encode(text)}</h3>";
    private static string P(string text) => $"<p>{Encode(text)}</p>";
    private static string Encode(string text) => WebUtility.HtmlEncode(text);
    private static string Percent(double share) => (share * 100).ToString("0.0", CultureInfo.InvariantCulture) + "%";
}
