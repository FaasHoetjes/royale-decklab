using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Configuration;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Load CLASH_ROYALE_API_KEY and friends from the repo-root .env (two levels up).
DotEnv.Load(Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", ".env")));

// Listen on 3000 so the existing Vite proxy (/api -> localhost:3000) and React
// app need no changes. In a container ASPNETCORE_URLS is set (to bind 0.0.0.0);
// honour it when present rather than forcing localhost.
if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
    builder.WebHost.UseUrls("http://localhost:3000");
}

// --- Options ---------------------------------------------------------------
builder.Services.Configure<MetaOptions>(builder.Configuration.GetSection(MetaOptions.SectionName));
builder.Services.Configure<ClashRoyaleOptions>(builder.Configuration.GetSection(ClashRoyaleOptions.SectionName));
// The token lives in CLASH_ROYALE_API_KEY (env / .env), not appsettings.
builder.Services.PostConfigure<ClashRoyaleOptions>(o =>
{
    var key = Environment.GetEnvironmentVariable("CLASH_ROYALE_API_KEY");
    if (!string.IsNullOrWhiteSpace(key))
    {
        o.ApiKey = key;
    }
});

// --- Controllers + JSON ----------------------------------------------------
// MVC web defaults are camelCase already; add the string-enum converter so
// CardVersionKind / BattleResult serialise as "normal"/"evo"/"hero", "win" etc.
builder.Services.AddControllers()
    .AddJsonOptions(o =>
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase)));

// Brotli/gzip the JSON payloads — the player profile and best-decks responses
// are 100-200 kB raw and compress ~85%, which is what mobile users feel.
builder.Services.AddResponseCompression(o => o.EnableForHttps = true);

// --- Data ------------------------------------------------------------------
var contentRoot = builder.Environment.ContentRootPath;
builder.Services.AddDbContext<MetaDbContext>((sp, opt) =>
{
    var meta = sp.GetRequiredService<IOptions<MetaOptions>>().Value;
    var dbPath = Path.GetFullPath(meta.DbPath, contentRoot);
    opt.UseSqlite($"Data Source={dbPath}");
});
builder.Services.AddScoped<BattleRepository>();

// --- Clash Royale API client (typed HttpClient) ----------------------------
builder.Services.AddHttpClient<ClashRoyaleClient>((sp, http) =>
    {
        var opt = sp.GetRequiredService<IOptions<ClashRoyaleOptions>>().Value;
        http.BaseAddress = new Uri(opt.BaseUrl.TrimEnd('/') + "/");
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", opt.ApiKey);
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    })
    // Standard resilience pipeline: 10s per-attempt timeout (vs the 100s
    // HttpClient default that ties up a request thread when the CR API stalls),
    // up to 3 retries with exponential backoff on 408/429/5xx/timeouts —
    // honouring Retry-After on 429 — and a circuit breaker so a dead upstream
    // fails fast. Hard errors like the IP-mismatch 403 are not retried.
    .AddStandardResilienceHandler();

// Player-profile cache: coalesces the burst of per-tag requests the SPA fires
// (war decks + collection + upgrades) into one upstream CR API call.
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<PlayerProfileCache>();

// --- Domain services -------------------------------------------------------
builder.Services.AddScoped<MetaBuilder>();
builder.Services.AddSingleton<CardCatalog>();
builder.Services.AddSingleton<MetaCache>();
builder.Services.AddHostedService<MetaRefreshService>();

// Scoring domain services are stateless — a single shared instance is fine.
builder.Services.AddSingleton<DeckAnalyzer>();
builder.Services.AddSingleton<BestDecksBuilder>();
builder.Services.AddSingleton<UpgradeAdvisor>();

// CORS exists only for local dev (the Vite server on 5173 hitting :3000
// directly). In production the SPA is served same-origin from wwwroot, so no
// cross-origin access is needed — and none is granted.
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
        p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));
}

// Unhandled exceptions become a bare ProblemDetails 500 via UseExceptionHandler
// below — exception messages can carry upstream URIs and file paths, which
// don't belong in a public response.
builder.Services.AddProblemDetails();

// The /api/player/* endpoints spend the rate-limited CR API key on the caller's
// behalf. The profile cache coalesces repeat lookups of the same tag, but only a
// per-IP cap stops a tag-enumeration loop from burning the upstream quota. The
// SPA fires at most three player calls per tag viewed, so 30/min is ample.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = static async (ctx, ct) =>
    {
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
});

var app = builder.Build();

// --- Database init ---------------------------------------------------------
// EnsureCreated builds the schema only when the DB doesn't exist yet. The data
// is derived/regenerable, so there's no migration history to maintain.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
    db.Database.EnsureCreated();
    // WAL persists in the file header; NORMAL sync is the standard WAL pairing.
    db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
    db.Database.ExecuteSqlRaw("PRAGMA synchronous=NORMAL;");
    // Seed the single meta_state row (no-op if it already exists).
    db.Database.ExecuteSqlRaw("INSERT OR IGNORE INTO meta_state (id, epoch_start_ms, last_build_ms) VALUES (1, 0, 0);");
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
}

// In production TLS terminates at a reverse proxy and the real client address
// arrives in X-Forwarded-For; it must replace the proxy's address before the
// per-IP rate limiter runs. Trust exactly one hop — the entry appended by our
// own proxy — so clients can't spoof an arbitrary IP past the limiter. Leave
// unset when :3000 is reached directly (local dev).
if (Environment.GetEnvironmentVariable("TRUST_PROXY_HEADERS") == "true")
{
    var forwarded = new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
        ForwardLimit = 1,
    };
    // The proxy's address is deployment-specific, so the default loopback-only
    // allowlist can't name it; ForwardLimit=1 is the spoofing guard instead.
    forwarded.KnownIPNetworks.Clear();
    forwarded.KnownProxies.Clear();
    app.UseForwardedHeaders(forwarded);
}

// Baseline security headers on every response. The CSP allows only same-origin
// assets — the SPA bundles everything, the theme-init script is an external file
// (so no inline-script hash to maintain), and the one external source is card
// art from Supercell's CDN. style-src needs 'unsafe-inline' because React sets
// styles via the style attribute; that does not enable <script> injection.
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.ContentSecurityPolicy =
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://api-assets.clashroyale.com; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'";
    headers.XContentTypeOptions = "nosniff";
    headers.XFrameOptions = "DENY";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    await next();
});

app.UseResponseCompression();
if (app.Environment.IsDevelopment())
{
    app.UseCors();
}
app.UseRateLimiter();

// Serve the built React SPA from wwwroot when it's present (production image).
// In local dev there's no wwwroot — Vite serves the app and proxies /api here,
// so this is a no-op and behaviour is unchanged.
app.UseStaticFiles();

// --- Endpoints -------------------------------------------------------------
app.MapControllers();

var spaIndex = Path.Combine(app.Environment.WebRootPath ?? string.Empty, "index.html");
if (File.Exists(spaIndex))
{
    // Unmatched /api/* stays a JSON 404; every other unmatched path serves the
    // SPA shell so client-side routing works on reload.
    app.MapFallback("/api/{**rest}", () => Results.Json(new { error = "Not found" }, statusCode: 404));
    app.MapFallbackToFile("index.html");
}
else
{
    app.MapFallback(() => Results.Json(new { error = "Not found" }, statusCode: 404));
}

app.Logger.LogInformation("Royale DeckLab API running on http://localhost:3000");
app.Run();
