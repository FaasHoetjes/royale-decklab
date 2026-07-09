using Microsoft.AspNetCore.Mvc;
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
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        try
        {
            var cards = await catalog.GetAsync(ct);
            var catalogById = cards.ToDictionary(c => c.Id);

            var sets = builder.BuildCached(cache.Version, cache.Meta, catalogById);
            return Ok(new { sets });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error generating best decks");
            return StatusCode(500, new { error = "Failed to generate best decks" });
        }
    }
}
