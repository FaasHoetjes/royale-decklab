using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
[EnableRateLimiting(RateLimitPolicies.Player)]
public sealed class UpgradesController(
    UpgradeAdviceCache adviceCache,
    ILogger<UpgradesController> logger) : ControllerBase
{
    [HttpGet("api/player/{tag}/upgrades")]
    public async Task<IActionResult> Get(string tag, CancellationToken ct)
    {
        if (!PlayerTag.IsValid(tag))
        {
            return BadRequest(new { error = "Invalid player tag" });
        }

        try
        {
            var (player, advice) = await adviceCache.GetAsync(tag, ct);
            if (advice is null)
            {
                return BadRequest(new { error = "Player cards data not found in API response" });
            }

            return Ok(new
            {
                player = new { tag = player.Tag, name = player.Name },
                baselineScore = advice.BaselineScore,
                collectionMaxed = advice.CollectionMaxed,
                suggestions = advice.Suggestions,
            });
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return NotFound(new { error = "Player not found" });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error generating upgrade advice for {Tag}", tag);
            return StatusCode(500, new { error = "Failed to generate upgrade advice" });
        }
    }
}
