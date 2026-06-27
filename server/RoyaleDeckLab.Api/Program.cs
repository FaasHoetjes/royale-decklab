using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Configuration;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Load the repo-root .env (two levels up from this project) so CLASH_ROYALE_API_KEY
// and friends work exactly as they do for the Bun server.
DotEnv.Load(Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", ".env")));

// Listen on 3000 so the existing Vite proxy (/api -> localhost:3000) and React
// app need no changes.
builder.WebHost.UseUrls("http://localhost:3000");

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
});

// --- Domain services -------------------------------------------------------
builder.Services.AddScoped<MetaBuilder>();
builder.Services.AddSingleton<CardCatalog>();
builder.Services.AddSingleton<MetaCache>();
builder.Services.AddHostedService<MetaRefreshService>();

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// --- Database init ---------------------------------------------------------
// EnsureCreated builds the schema only when the DB doesn't exist yet (an existing
// Bun-created meta.db is left exactly as-is). The data is derived/regenerable, so
// there's no migration history to maintain.
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

app.UseCors();

// --- Endpoints -------------------------------------------------------------
app.MapControllers();

// Match the Bun server's 404 body shape.
app.MapFallback(() => Results.Json(new { error = "Not found" }, statusCode: 404));

app.Logger.LogInformation("Royale DeckLab API running on http://localhost:3000");
app.Run();
