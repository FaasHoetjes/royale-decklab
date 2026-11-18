using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
[Route("api/cards")]
public sealed class CardsController(
    CardCatalog catalog,
    MetaCache cache,
    BestDecksBuilder decks,
    BalanceUpdateStore balanceUpdates,
    ILogger<CardsController> logger) : ControllerBase
{
    public const int DecksPerCard = 5;

    [HttpGet]
    [OutputCache(PolicyName = "public-json")]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> Get()
    {
        try
        {
            var cards = await catalog.GetAsync();
            return Ok(new { cards });
        }
        catch (Exception ex)
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
    public async Task<IActionResult> Decks(int id)
    {
        try
        {
            var cards = await catalog.GetAsync();
            if (!cards.Any(c => c.Id == id))
            {
                return NotFound(new { error = "Unknown card" });
            }
            return Ok(new { decks = decks.TopDecksWithCached(id, cache.Version, cache.Meta, cards, DecksPerCard) });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error finding decks for card {CardId}", id);
            Response.Headers.CacheControl = "no-store";
            return StatusCode(500, new { error = "Failed to find decks for this card" });
        }
    }

    [HttpGet("{id:int}/insights")]
    [OutputCache(PolicyName = "public-json")]
    [RequireMetaLoaded]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> Insights(int id)
    {
        try
        {
            var cards = await catalog.GetAsync();
            if (cards.FirstOrDefault(c => c.Id == id) is not { } card)
            {
                return NotFound(new { error = "Unknown card" });
            }
            return Ok(InsightsFor(card, cards, cache, decks, balanceUpdates));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error writing insights for card {CardId}", id);
            Response.Headers.CacheControl = "no-store";
            return StatusCode(500, new { error = "Failed to write insights for this card" });
        }
    }

    public static CardInsightsResponse InsightsFor(
        CatalogCard card, IReadOnlyList<CatalogCard> cards, MetaCache meta, BestDecksBuilder decks, BalanceUpdateStore balanceUpdates)
        => CardInsightsText.Build(
            card,
            cards,
            meta.CardStats,
            meta.CardInsights.GetValueOrDefault(card.Id),
            meta.PatchHistory,
            decks.TopDecksWithCached(card.Id, meta.Version, meta.Meta, cards, DecksPerCard),
            balanceUpdates.During(meta.CardStats, cards));
}
