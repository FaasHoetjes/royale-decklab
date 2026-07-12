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
    var hasSeasonColumn = db.Database.SqlQueryRaw<int>(
        "SELECT COUNT(*) AS Value FROM pragma_table_info('meta_state') WHERE name = 'known_season_id'").Single() > 0;
    if (!hasSeasonColumn)
    {
        db.Database.ExecuteSqlRaw("ALTER TABLE meta_state ADD COLUMN known_season_id INTEGER NOT NULL DEFAULT 0;");
    }
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

app.MapGet("/healthz", () => Results.Ok(new { status = "ok" })).DisableRateLimiting();

app.MapGet("/.well-known/security.txt", () => Results.Text(
    """
    Contact: mailto:faashoetjes+royaledecklab@gmail.com
    Expires: 2027-07-11T00:00:00Z
    Preferred-Languages: en, nl
    Canonical: https://royaledecklab.com/.well-known/security.txt
    """, "text/plain"));

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
    app.MapFallback("/api/{**rest}", () => Results.Json(new { error = "Not found" }, statusCode: 404));
    app.MapFallbackToFile("index.html", spaStaticFiles);
}
else
{
    app.MapFallback(() => Results.Json(new { error = "Not found" }, statusCode: 404));
}

app.Logger.LogInformation("Royale DeckLab API running on http://localhost:3000");
app.Run();
