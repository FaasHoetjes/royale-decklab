using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
[Route("api/meta")]
public sealed class MetaController(MetaCache cache, BattleRepository store) : ControllerBase
{
    private const long FutureTimestampToleranceMs = 5 * 60_000;

    [HttpGet("status")]
    public IActionResult Status()
    {
        var last = cache.LastCacheTime;
        var epoch = cache.EpochStart;
        var season = store.GetKnownSeasonId();
        return Ok(new
        {
            status = "ok",
            deckCount = cache.DeckCount,
            cacheAgeMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - last,
            lastRefresh = MetaCache.IsoMs(last),
            epochStart = epoch > 0 ? MetaCache.IsoMs(epoch) : null,
            seasonId = season > 0 ? season : (int?)null
        });
    }

    [HttpPost("refresh")]
    [RequireAdminToken]
    [EnableRateLimiting(RateLimitPolicies.Admin)]
    public async Task<IActionResult> Refresh()
    {
        if (cache.IsBuilding)
        {
            return StatusCode(409, new { status = "busy", message = "A meta rebuild is already in progress" });
        }
        var decks = await cache.RebuildAsync("manual");
        return Ok(new { status = "refreshed", deckCount = decks.Count });
    }

    // Set the patch boundary after a balance update.
    [HttpPost("epoch")]
    [RequireAdminToken]
    [EnableRateLimiting(RateLimitPolicies.Admin)]
    public async Task<IActionResult> SetEpoch()
    {
        if (cache.IsBuilding)
        {
            return StatusCode(409, new { status = "busy", message = "A meta rebuild is already in progress" });
        }

        using var reader = new StreamReader(Request.Body);
        var body = await reader.ReadToEndAsync(HttpContext.RequestAborted);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (EpochTimestamp(body, now) is not { } ts)
        {
            return StatusCode(400,
                new { status = "error", message = "Invalid timestamp. Use an ISO date, epoch ms, or \"now\"." });
        }

        if (ts > now + FutureTimestampToleranceMs)
        {
            return StatusCode(400, new { status = "error", message = "Timestamp is in the future." });
        }

        var decks = await cache.SetEpochAsync(ts, HttpContext.RequestAborted);
        return Ok(new
        {
            status = "epoch-set",
            epochStart = MetaCache.IsoMs(ts),
            deckCount = decks.Count,
            battlesKept = cache.BattleCount()
        });
    }

    /// <summary>
    /// An empty body, <c>{}</c>, a null timestamp and "now" all mean now. Anything it can't read gives null, because
    /// guessing "now" for a typo would move the patch boundary and down-weight every battle before it.
    /// </summary>
    public static long? EpochTimestamp(string body, long now)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return now;
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(body);
        }
        catch (JsonException)
        {
            return null;
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return null;
            }
            if (!root.TryGetProperty("timestamp", out var timestamp) || timestamp.ValueKind == JsonValueKind.Null)
            {
                return now;
            }
            if (timestamp.ValueKind == JsonValueKind.Number)
            {
                return timestamp.TryGetInt64(out var ms) ? ms : null;
            }
            if (timestamp.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            var raw = timestamp.GetString();
            if (raw == "now")
            {
                return now;
            }
            return DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed)
                ? parsed.ToUnixTimeMilliseconds()
                : null;
        }
    }
}
