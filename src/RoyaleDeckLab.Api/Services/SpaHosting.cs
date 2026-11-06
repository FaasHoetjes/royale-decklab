using System.Text.RegularExpressions;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Controllers;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Serves the built client: its files, the site files around it, and index.html with each route's own head tags.</summary>
public static partial class SpaHosting
{
    private static readonly TimeSpan PageDataTimeout = TimeSpan.FromSeconds(2);

    public static void UseSpaStaticFiles(this WebApplication app) => app.UseStaticFiles(new StaticFileOptions
    {
        OnPrepareResponse = ctx =>
        {
            var path = ctx.Context.Request.Path;
            ctx.Context.Response.Headers.CacheControl =
                path.StartsWithSegments("/assets") ? "public, max-age=31536000, immutable"
                : path.StartsWithSegments("/badges") ? "public, max-age=604800"
                : "no-cache";
        },
    });

    public static void MapSiteFiles(this WebApplication app)
    {
        // Uptime monitors probe with HEAD, which MapGet alone leaves to the SPA fallback and its 404.
        app.MapMethods("/healthz", ["GET", "HEAD"], () => Results.Ok(new { status = "ok" })).DisableRateLimiting();

        app.MapGet("/.well-known/security.txt", () => Results.Text(
            """
            Contact: mailto:faashoetjes+royaledecklab@gmail.com
            Expires: 2027-07-11T00:00:00Z
            Preferred-Languages: en, nl
            Canonical: https://royaledecklab.com/.well-known/security.txt
            """, "text/plain"));

        app.MapGet("/robots.txt", () => Results.Text(
            $"""
            User-agent: *
            Allow: /
            Disallow: /admin

            Sitemap: {SpaPages.Origin}/sitemap.xml
            """, "text/plain"));

        app.MapGet("/sitemap.xml", async (HttpContext ctx, CardCatalog catalog) =>
        {
            ctx.Response.Headers.CacheControl = "public, max-age=3600";
            return Results.Text(SpaPages.Sitemap(await CardsOrEmpty(catalog, ctx.RequestAborted)), "application/xml");
        });
    }

    public static void MapSpaFallback(this WebApplication app)
    {
        var spaIndex = Path.Combine(app.Environment.WebRootPath ?? string.Empty, "index.html");
        if (!File.Exists(spaIndex))
        {
            app.MapFallback(() => Results.Json(new { error = "Not found" }, statusCode: 404));
            return;
        }

        var indexHtml = File.ReadAllText(spaIndex);
        var earlyHintLink = BuildEarlyHintLink(indexHtml);
        var faqFile = Path.Combine(app.Environment.ContentRootPath, "prerender", "faq.html");
        var faqHtml = File.Exists(faqFile) ? File.ReadAllText(faqFile) : null;

        app.MapFallback("/api/{**rest}", () => Results.Json(new { error = "Not found" }, statusCode: 404));
        app.MapFallback(async (HttpContext ctx, CardCatalog catalog, MetaCache meta, PlayerProfileCache profiles, BestDecksBuilder decks, ILogger<SpaPage> logger) =>
        {
            ctx.Response.Headers.CacheControl = "no-cache";
            ctx.Response.Headers.Link = earlyHintLink;

            var path = ctx.Request.Path.Value;
            var cards = SpaPages.IsCardPath(path) ? await CardsOrEmpty(catalog, ctx.RequestAborted) : [];
            var page = SpaPages.Resolve(path, cards, meta.CardStats.Cards, DateTimeOffset.UtcNow);
            var share = ctx.Request.Query["share"].ToString();
            if (page.PlayerTag is { } playerTag && SpaPages.IsShareCode(share))
            {
                page = SpaPages.SharedLineup(page, await PlayerNameOrNull(profiles, playerTag, ctx.RequestAborted), share);
            }
            if (page.NoIndex)
            {
                ctx.Response.Headers["X-Robots-Tag"] = "noindex";
            }
            try
            {
                page = page with { Body = await PageBody(page, catalog, meta, decks, faqHtml, ctx.RequestAborted) };
            }
            catch (Exception ex) when (!ctx.RequestAborted.IsCancellationRequested)
            {
                logger.LogError(ex, "Couldn't write the content of {Path}", path);
            }
            return Results.Content(SpaPages.Render(indexHtml, page), "text/html; charset=utf-8", statusCode: page.StatusCode);
        });
    }

    // Pages shouldn't wait out the Clash Royale API's retries; without the catalog they're served generically instead.
    private static async Task<IReadOnlyList<CatalogCard>> CardsOrEmpty(CardCatalog catalog, CancellationToken requestAborted)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        timeout.CancelAfter(PageDataTimeout);
        try
        {
            return await catalog.GetAsync(timeout.Token);
        }
        catch (Exception) when (!requestAborted.IsCancellationRequested)
        {
            return [];
        }
    }

    // Crawlers that don't run JavaScript get each page's content in its HTML; a page whose data isn't in yet still gets its heading.
    private static async Task<string?> PageBody(SpaPage page, CardCatalog catalog, MetaCache meta, BestDecksBuilder decks, string? faqHtml, CancellationToken requestAborted)
    {
        var heading = page.Heading ?? "";
        switch (page.Content)
        {
            case SpaContentKind.Home: return SpaContent.Home(heading);
            case SpaContentKind.Builder: return SpaContent.Builder(heading);
            case SpaContentKind.Upgrades: return SpaContent.Upgrades(heading);
            case SpaContentKind.Clan: return SpaContent.Clan(heading);
            case SpaContentKind.Faq: return SpaContent.Faq(heading, faqHtml);
        }
        if (page.Content is not (SpaContentKind.BestDecks or SpaContentKind.Cards or SpaContentKind.Card))
        {
            return null;
        }
        var cards = await CardsOrEmpty(catalog, requestAborted);
        var catalogById = cards.ToDictionary(c => c.Id);
        var loaded = meta.IsLoaded && cards.Count > 0;
        return page.Content switch
        {
            SpaContentKind.BestDecks => SpaContent.BestDecks(heading, loaded ? decks.BuildCached(meta.Version, meta.Meta, catalogById) : []),
            SpaContentKind.Cards => SpaContent.Cards(heading, cards, meta.CardStats),
            _ => SpaContent.Card(
                page.Card!,
                meta.CardStats.Cards.FirstOrDefault(s => s.Id == page.Card!.Id),
                meta.IsLoaded,
                loaded ? decks.TopDecksWith(page.Card!.Id, meta.Meta, catalogById, CardsController.DecksPerCard) : []),
        };
    }

    private static async Task<string?> PlayerNameOrNull(PlayerProfileCache profiles, string playerTag, CancellationToken requestAborted)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        timeout.CancelAfter(PageDataTimeout);
        try
        {
            return (await profiles.GetPlayerDataAsync(playerTag, timeout.Token).WaitAsync(timeout.Token)).Name;
        }
        catch (Exception) when (!requestAborted.IsCancellationRequested)
        {
            return null;
        }
    }

    private static string BuildEarlyHintLink(string html)
    {
        var links = new List<string>();
        var css = CssAssetRegex().Match(html);
        if (css.Success) links.Add($"<{css.Value}>; rel=preload; as=style");
        var js = JsAssetRegex().Match(html);
        if (js.Success) links.Add($"<{js.Value}>; rel=modulepreload");
        return string.Join(", ", links);
    }

    [GeneratedRegex(@"/assets/[^""']+\.css")]
    private static partial Regex CssAssetRegex();

    [GeneratedRegex(@"/assets/[^""']+\.js")]
    private static partial Regex JsAssetRegex();
}
