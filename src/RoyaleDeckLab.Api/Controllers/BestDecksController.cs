using Microsoft.AspNetCore.Mvc;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

/// <summary>
/// Serves GET /api/best-decks: up to ten diverse sets of four card-disjoint meta
/// decks, independent of any player's collection. Reads the current meta cache and
/// the card catalog, then delegates the set-building to <see cref="BestDecksBuilder"/>.
/// </summary>
[ApiController]
public sealed class BestDecksController(
    MetaCache cache,
    CardCatalog catalog,
    BestDecksBuilder builder,
    ILogger<BestDecksController> logger) : ControllerBase
{
    [HttpGet("api/best-decks")]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        try
        {
            var cards = await catalog.GetAsync(ct);
            var catalogById = cards.ToDictionary(c => c.Id);

            var sets = builder.Build(cache.Meta, catalogById);
            return Ok(new { sets });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error generating best decks");
            return StatusCode(500, new { error = "Failed to generate best decks" });
        }
    }
}
