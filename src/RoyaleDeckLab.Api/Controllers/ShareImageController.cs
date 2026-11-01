using System.Net;
using Microsoft.AspNetCore.Mvc;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

// Not under the player limit: chat apps fetch previews from a few shared IPs, and the image is cached.
[ApiController]
public sealed class ShareImageController(ShareImageService images, ILogger<ShareImageController> logger) : ControllerBase
{
    [HttpGet("api/player/{tag}/share-image")]
    [RequireMetaLoaded]
    public async Task<IActionResult> Get(string tag, [FromQuery] string? share, CancellationToken ct)
    {
        if (!PlayerTag.IsValid(tag))
        {
            return BadRequest(new { error = "Invalid player tag" });
        }

        try
        {
            var jpeg = await images.GetAsync(tag, share, ct);
            if (jpeg is null)
            {
                return NotFound(new { error = "No shared lineup to draw" });
            }
            Response.Headers.CacheControl = "public, max-age=86400";
            return File(jpeg, "image/jpeg");
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return NotFound(new { error = "Player not found" });
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Error drawing the share image for {Tag}", tag);
            return StatusCode(500, new { error = "Failed to draw the share image" });
        }
    }
}
