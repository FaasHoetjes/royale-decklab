using System.IO.Compression;
using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Configuration;
using RoyaleDeckLab.Api.Controllers;
using RoyaleDeckLab.Api.Data;
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
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ClanWarCache>();
builder.Services.AddSingleton<ClanSearchCache>();
builder.Services.AddSingleton<WarDecksTodayReader>();

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
builder.Services.AddSingleton<LivePresence>();
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

builder.Services.AddSiteRateLimits();

var app = builder.Build();

app.EnsureMetaSchema();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(new ExceptionHandlerOptions
    {
        StatusCodeSelector = ex => ex is Microsoft.AspNetCore.Http.BadHttpRequestException bad
            ? bad.StatusCode
            : StatusCodes.Status500InternalServerError,
    });
}

app.UseProxyHeaders();
app.UseSecurityHeaders();

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
    app.Logger.LogInformation("{Method} {Route} => {Status} in {Elapsed:F1} ms",
        context.Request.Method, RequestRoute.Of(context), context.Response.StatusCode, elapsed.TotalMilliseconds);
});

app.UseResponseCompression();
if (app.Environment.IsDevelopment())
{
    app.UseCors();
}
app.UseRateLimiter();
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(20),
    KeepAliveTimeout = TimeSpan.FromSeconds(20),
});

app.MapSiteFiles();
app.UseSpaStaticFiles();
app.MapControllers();
app.MapLiveEndpoints();
app.MapSpaFallback();

app.Logger.LogInformation("Royale DeckLab API running on http://localhost:3000");
app.Run();
