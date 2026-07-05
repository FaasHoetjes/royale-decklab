using Microsoft.AspNetCore.Mvc;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

/// <summary>Card catalog passthrough. Serves GET /api/cards.</summary>
[ApiController]
[Route("api/cards")]
public sealed class CardsController(CardCatalog catalog, ILogger<CardsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        try
        {
            var cards = await catalog.GetAsync(ct);
            return Ok(new { cards });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error fetching card catalog");
            return StatusCode(500, new { error = "Failed to fetch card catalog" });
        }
    }
}
