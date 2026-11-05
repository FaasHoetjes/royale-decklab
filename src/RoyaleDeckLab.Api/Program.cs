using System.IO.Compression;
using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Configuration;
using RoyaleDeckLab.Api.Controllers;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;
using RoyaleDeckLab.Api.Services.Stats;

var builder = WebApplication.CreateBuilder(args);

DotEnv.Load(Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", ".env")));

if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
    builder.WebHost.UseUrls("http://localhost:3000");
}

builder.Services.Configure<MetaOptions>(builder.Configuration.GetSection(MetaOptions.SectionName));
builder.Services.Configure<ClashRoyaleOptions>(builder.Configuration.GetSection(ClashRoyaleOptions.SectionName));
builder.Services.PostConfigure<ClashRoyaleOptions>(o =>
{
    var key = Environment.GetEnvironmentVariable("CLASH_ROYALE_API_KEY");
    if (!string.IsNullOrWhiteSpace(key))
    {
        o.ApiKey = key;
    }
});

builder.Services.AddControllers()
    .AddJsonOptions(o =>
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase)));

builder.Services.AddResponseCompression(o => o.EnableForHttps = true);
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);

var contentRoot = builder.Environment.ContentRootPath;
builder.Services.AddDbContext<MetaDbContext>((sp, opt) =>
{
    var meta = sp.GetRequiredService<IOptions<MetaOptions>>().Value;
    var dbPath = Path.GetFullPath(meta.DbPath, contentRoot);
    opt.UseSqlite($"Data Source={dbPath}");
});
builder.Services.AddScoped<BattleRepository>();

builder.Services.AddHttpClient<ClashRoyaleClient>((sp, http) =>
    {
        var opt = sp.GetRequiredService<IOptions<ClashRoyaleOptions>>().Value;
        http.BaseAddress = new Uri(opt.BaseUrl.TrimEnd('/') + "/");
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", opt.ApiKey);
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    })
    .AddStandardResilienceHandler();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<PlayerProfileCache>();

builder.Services.AddScoped<MetaBuilder>();
builder.Services.AddSingleton<CardCatalog>();
builder.Services.AddHttpClient(CardArtCache.HttpClientName, http => http.MaxResponseContentBufferSize = 4 * 1024 * 1024)
    .AddStandardResilienceHandler();
builder.Services.AddSingleton<CardArtCache>();
builder.Services.AddSingleton<ShareImageService>();
builder.Services.AddSingleton(sp =>
{
    var meta = sp.GetRequiredService<IOptions<MetaOptions>>().Value;
    var metaDb = Path.GetFullPath(meta.DbPath, contentRoot);
    return new StatsStore(Path.Combine(Path.GetDirectoryName(metaDb)!, "stats.db"));
});
builder.Services.AddSingleton<StatsRecorder>();
builder.Services.AddHostedService<StatsWriter>();
builder.Services.AddSingleton<MetaCache>();
builder.Services.AddHostedService<MetaRefreshService>();
builder.Services.AddHostedService<SeasonWatchService>();

builder.Services.AddSingleton<DeckAnalyzer>();
builder.Services.AddSingleton<BestDecksBuilder>();
builder.Services.AddSingleton<UpgradeAdvisor>();
builder.Services.AddSingleton<UpgradeAdviceCache>();

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
        p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));
}

builder.Services.AddProblemDetails();

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = static async (ctx, ct) =>
    {
        ctx.HttpContext.Response.Headers.RetryAfter = "60";
        ctx.HttpContext.Response.ContentType = "application/json";
        await ctx.HttpContext.Response.WriteAsync("""{"error":"Too many requests. Try again in a minute."}""", ct);
    };
    o.AddPolicy(RateLimitPolicies.Player, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        static _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 30,
            Window = TimeSpan.FromMinutes(1),
        }));
    o.AddPolicy(RateLimitPolicies.Admin, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        static _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(1),
        }));
    o.AddPolicy(RateLimitPolicies.Stats, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        static _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 60,
            Window = TimeSpan.FromMinutes(1),
        }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            static _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 300,
                Window = TimeSpan.FromMinutes(1),
            }));
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
    db.Database.EnsureCreated();
    db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
    db.Database.ExecuteSqlRaw("PRAGMA synchronous=NORMAL;");
    // EnsureCreated only creates a fresh database, so columns and tables added since are created here.
    bool HasStateColumn(string name) => db.Database.SqlQuery<int>(
        $"SELECT COUNT(*) AS Value FROM pragma_table_info('meta_state') WHERE name = {name}").Single() > 0;
    if (!HasStateColumn("known_season_id"))
    {
        db.Database.ExecuteSqlRaw("ALTER TABLE meta_state ADD COLUMN known_season_id INTEGER NOT NULL DEFAULT 0;");
    }
    if (!HasStateColumn("previous_epoch_start_ms"))
    {
        db.Database.ExecuteSqlRaw("ALTER TABLE meta_state ADD COLUMN previous_epoch_start_ms INTEGER NOT NULL DEFAULT 0;");
    }
    db.Database.ExecuteSqlRaw(
        """
        CREATE TABLE IF NOT EXISTS card_periods (
            end_ms INTEGER NOT NULL CONSTRAINT PK_card_periods PRIMARY KEY,
            start_ms INTEGER NOT NULL,
            battles INTEGER NOT NULL,
            cards TEXT NOT NULL
        );
        """);
    db.Database.ExecuteSqlRaw(
        "INSERT OR IGNORE INTO meta_state (id, epoch_start_ms, last_build_ms, known_season_id) VALUES (1, 0, 0, 0);");
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(new ExceptionHandlerOptions
    {
        StatusCodeSelector = ex => ex is Microsoft.AspNetCore.Http.BadHttpRequestException bad
            ? bad.StatusCode
            : StatusCodes.Status500InternalServerError,
    });
}

if (Environment.GetEnvironmentVariable("TRUST_PROXY_HEADERS") == "true")
{
    var forwarded = new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
        ForwardLimit = 2,
    };
    forwarded.KnownIPNetworks.Clear();
    forwarded.KnownProxies.Clear();

    var trustedProxies = Environment.GetEnvironmentVariable("TRUSTED_PROXY_IPS");
    if (!string.IsNullOrWhiteSpace(trustedProxies))
    {
        foreach (var entry in trustedProxies.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            if (entry.Contains('/'))
            {
                forwarded.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(entry));
            }
            else
            {
                forwarded.KnownProxies.Add(System.Net.IPAddress.Parse(entry));
            }
        }
    }
    app.UseForwardedHeaders(forwarded);
    app.Use((context, next) =>
    {
        var visitor = CloudflareClientIp.Resolve(
            context.Connection.RemoteIpAddress,
            context.Request.Headers[CloudflareClientIp.HeaderName].ToString());
        if (visitor is not null)
        {
            context.Connection.RemoteIpAddress = visitor;
            context.Items[StatsRecorder.ViaCloudflare] = true;
        }
        return next(context);
    });
}

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.ContentSecurityPolicy =
        "default-src 'self'; " +
        "script-src 'self' https://static.cloudflareinsights.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://api-assets.clashroyale.com; " +
        "connect-src 'self' https://cloudflareinsights.com; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'";
    headers.StrictTransportSecurity = "max-age=31536000";
    headers.XContentTypeOptions = "nosniff";
    headers.XFrameOptions = "DENY";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    await next();
});

app.Use(async (context, next) =>
{
    if (!context.Request.Path.StartsWithSegments("/api"))
    {
        await next();
        return;
    }
    var start = System.Diagnostics.Stopwatch.GetTimestamp();
    await next();
    var elapsed = System.Diagnostics.Stopwatch.GetElapsedTime(start);
    app.Logger.LogInformation("{Method} {Path} => {Status} in {Elapsed:F1} ms",
        context.Request.Method, context.Request.Path, context.Response.StatusCode, elapsed.TotalMilliseconds);
});

app.UseResponseCompression();
if (app.Environment.IsDevelopment())
{
    app.UseCors();
}
app.UseRateLimiter();

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

var spaStaticFiles = new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers.CacheControl =
            ctx.Context.Request.Path.StartsWithSegments("/assets")
                ? "public, max-age=31536000, immutable"
                : "no-cache";
    },
};
app.UseStaticFiles(spaStaticFiles);

app.MapControllers();

var spaIndex = Path.Combine(app.Environment.WebRootPath ?? string.Empty, "index.html");
if (File.Exists(spaIndex))
{
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
else
{
    app.MapFallback(() => Results.Json(new { error = "Not found" }, statusCode: 404));
}

// Pages shouldn't wait out the Clash Royale API's retries; without the catalog they're served generically instead.
static async Task<IReadOnlyList<CatalogCard>> CardsOrEmpty(CardCatalog catalog, CancellationToken requestAborted)
{
    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
    timeout.CancelAfter(TimeSpan.FromSeconds(2));
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
static async Task<string?> PageBody(SpaPage page, CardCatalog catalog, MetaCache meta, BestDecksBuilder decks, string? faqHtml, CancellationToken requestAborted)
{
    var heading = page.Heading ?? "";
    switch (page.Content)
    {
        case SpaContentKind.Home: return SpaContent.Home(heading);
        case SpaContentKind.Builder: return SpaContent.Builder(heading);
        case SpaContentKind.Upgrades: return SpaContent.Upgrades(heading);
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

static async Task<string?> PlayerNameOrNull(PlayerProfileCache profiles, string playerTag, CancellationToken requestAborted)
{
    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
    timeout.CancelAfter(TimeSpan.FromSeconds(2));
    try
    {
        return (await profiles.GetPlayerDataAsync(playerTag, timeout.Token).WaitAsync(timeout.Token)).Name;
    }
    catch (Exception) when (!requestAborted.IsCancellationRequested)
    {
        return null;
    }
}

static string BuildEarlyHintLink(string html)
{
    var links = new List<string>();
    var css = Regex.Match(html, @"/assets/[^""']+\.css");
    if (css.Success) links.Add($"<{css.Value}>; rel=preload; as=style");
    var js = Regex.Match(html, @"/assets/[^""']+\.js");
    if (js.Success) links.Add($"<{js.Value}>; rel=modulepreload");
    return string.Join(", ", links);
}

app.Logger.LogInformation("Royale DeckLab API running on http://localhost:3000");
app.Run();
