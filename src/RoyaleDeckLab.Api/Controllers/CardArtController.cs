using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

// A builder page shows 100+ cards, which would trip the global limiter; only catalog art is ever fetched.
[ApiController]
[DisableRateLimiting]
public sealed class CardArtController(CardArtCache art, ILogger<CardArtController> logger) : ControllerBase
{
    [HttpGet("img/{kind}/{hash}.webp")]
    public async Task<IActionResult> Get(string kind, string hash, CancellationToken ct)
    {
        try
        {
            var path = await art.GetAsync(kind, hash, ct);
            if (path is null)
            {
                return NotFound();
            }
            Response.Headers.CacheControl = $"public, max-age={(int)CardArtCache.MaxAge.TotalSeconds}";
            return PhysicalFile(path, "image/webp");
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Error serving card art {Kind}/{Hash}", kind, hash);
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }
}
