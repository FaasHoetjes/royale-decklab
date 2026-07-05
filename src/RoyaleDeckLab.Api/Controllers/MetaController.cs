using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

/// <summary>Meta status / refresh / patch-boundary endpoints (the /api/meta/* routes).</summary>
[ApiController]
[Route("api/meta")]
public sealed class MetaController(MetaCache cache) : ControllerBase
{
    [HttpGet("status")]
    public IActionResult Status()
    {
        var last = cache.LastCacheTime;
        var epoch = cache.EpochStart;
        return Ok(new
        {
            status = "ok",
            deckCount = cache.DeckCount,
            cacheAgeMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - last,
            lastRefresh = MetaCache.IsoMs(last),
            epochStart = epoch > 0 ? MetaCache.IsoMs(epoch) : null
        });
    }

    // Admin-gated: one call fans out into thousands of upstream CR API fetches,
    // so an open endpoint would let anyone keep the key pinned at its rate limit.
    [HttpPost("refresh")]
    [RequireAdminToken]
    public async Task<IActionResult> Refresh()
    {
        if (cache.IsBuilding)
        {
            return StatusCode(409, new { status = "busy", message = "A meta rebuild is already in progress" });
        }
        var decks = await cache.RebuildAsync("manual");
        return Ok(new { status = "refreshed", deckCount = decks.Count });
    }

    // Set the patch boundary after a balance update. Body: { "timestamp":
    // <ISO string | epoch ms | "now"> }, defaulting to now. Drops pre-boundary
    // battles and re-aggregates immediately (no re-fetch). Admin-gated: this
    // permanently deletes stored battles that can't be re-collected.
    [HttpPost("epoch")]
    [RequireAdminToken]
    public async Task<IActionResult> SetEpoch()
    {
        if (cache.IsBuilding)
        {
            return StatusCode(409, new { status = "busy", message = "A meta rebuild is already in progress" });
        }

        JsonElement? timestamp = null;
        try
        {
            // Read the body by hand so a missing/empty body is allowed (falls back
            // to "now") rather than triggering the [ApiController] 400-on-null-body.
            var body = await Request.ReadFromJsonAsync<JsonElement>();
            if (body is { ValueKind: JsonValueKind.Object } el && el.TryGetProperty("timestamp", out var t))
            {
                timestamp = t;
            }
        }
        catch
        {
            // No / invalid body: fall through to "now".
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        long ts;
        if (timestamp is null
            || timestamp.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
            || (timestamp.Value.ValueKind == JsonValueKind.String && timestamp.Value.GetString() == "now"))
        {
            ts = now;
        }
        else if (timestamp.Value.ValueKind == JsonValueKind.Number)
        {
            ts = timestamp.Value.GetInt64();
        }
        else
        {
            var raw = timestamp.Value.ValueKind == JsonValueKind.String ? timestamp.Value.GetString() : null;
            if (!DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed))
            {
                return StatusCode(400,
                    new { status = "error", message = "Invalid timestamp. Use an ISO date, epoch ms, or \"now\"." });
            }
            ts = parsed.ToUnixTimeMilliseconds();
        }

        // A future boundary would persist and then prune every battle collected
        // until that date arrives, leaving the meta permanently empty. Nothing
        // legitimate sets a patch time ahead of the clock (5 min skew allowed).
        if (ts > now + 5 * 60_000)
        {
            return StatusCode(400, new { status = "error", message = "Timestamp is in the future." });
        }

        var decks = cache.SetEpoch(ts);
        return Ok(new
        {
            status = "epoch-set",
            epochStart = MetaCache.IsoMs(ts),
            deckCount = decks.Count,
            battlesKept = cache.BattleCount()
        });
    }
}
