using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
[Route("api/cards")]
public sealed class CardsController(
    CardCatalog catalog,
    MetaCache cache,
    BestDecksBuilder decks,
    ILogger<CardsController> logger) : ControllerBase
{
    public const int DecksPerCard = 5;

    [HttpGet]
    [OutputCache(PolicyName = "public-json")]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        try
        {
            var cards = await catalog.GetAsync(ct);
            return Ok(new { cards });
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Error fetching card catalog");
            Response.Headers.CacheControl = "no-store";
            return StatusCode(500, new { error = "Failed to fetch card catalog" });
        }
    }

    [HttpGet("stats")]
    [OutputCache(PolicyName = "public-json")]
    [RequireMetaLoaded]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public IActionResult Stats() => Ok(cache.CardStats);

    [HttpGet("{id:int}/decks")]
    [OutputCache(PolicyName = "public-json")]
    [RequireMetaLoaded]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> Decks(int id, CancellationToken ct)
    {
        try
        {
            var cards = await catalog.GetAsync(ct);
            if (!cards.Any(c => c.Id == id))
            {
                return NotFound(new { error = "Unknown card" });
            }
            return Ok(new { decks = decks.TopDecksWithCached(id, cache.Version, cache.Meta, cards, DecksPerCard) });
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Error finding decks for card {CardId}", id);
            Response.Headers.CacheControl = "no-store";
            return StatusCode(500, new { error = "Failed to find decks for this card" });
        }
    }
}
