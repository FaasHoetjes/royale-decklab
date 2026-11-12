using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class BestDecksController(
    MetaCache cache,
    CardCatalog catalog,
    BestDecksBuilder builder,
    ILogger<BestDecksController> logger) : ControllerBase
{
    [HttpGet("api/best-decks")]
    [RequireMetaLoaded]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    [OutputCache(PolicyName = "public-json")]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        try
        {
            var cards = await catalog.GetAsync(ct);
            var sets = builder.BuildCached(cache.Version, cache.Meta, cards);
            return Ok(new { sets });
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Error generating best decks");
            Response.Headers.CacheControl = "no-store";
            return StatusCode(500, new { error = "Failed to generate best decks" });
        }
    }
}
