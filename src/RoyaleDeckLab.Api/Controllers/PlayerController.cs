using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;
using RoyaleDeckLab.Api.Services.Stats;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
[EnableRateLimiting(RateLimitPolicies.Player)]
public sealed class PlayerController(
    PlayerProfileCache players,
    MetaCache cache,
    PlayerDeckCache deckCache,
    WarDecksTodayReader warDecksToday,
    StatsRecorder stats,
    ILogger<PlayerController> logger) : ControllerBase
{
    [HttpGet("api/player/{tag}/summary")]
    public async Task<ActionResult<PlayerSummary>> Summary(string tag, CancellationToken ct)
    {
        if (!PlayerTag.IsValid(tag)) return BadRequest(new { error = "Invalid player tag" });
        try
        {
            var player = await players.GetPlayerDataAsync(tag, ct);
            return new PlayerSummary(player.Tag, player.Name, player.Clan?.Tag, player.Clan?.Name, player.Clan?.BadgeId);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return NotFound(new { error = "Player not found" });
        }
    }

    [HttpGet("api/player/{tag}/collection")]
    public async Task<IActionResult> Collection(string tag, CancellationToken ct)
    {
        if (!PlayerTag.IsValid(tag))
        {
            return BadRequest(new { error = "Invalid player tag" });
        }

        try
        {
            var player = await players.GetPlayerDataAsync(tag, ct);
            if (player.Cards is null)
            {
                return BadRequest(new { error = "Player cards data not found in API response" });
            }

            var cards = player.Cards.Select(c => new
            {
                id = c.Id,
                name = c.Name,
                level = c.Level,
                maxLevel = c.MaxLevel,
                evolutionLevel = c.EvolutionLevel,
                elixirCost = c.ElixirCost,
                iconUrls = c.IconUrls,
            });

            return Ok(new { player = new { tag = player.Tag, name = player.Name }, cards });
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return NotFound(new { error = "Player not found" });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error fetching player collection");
            return StatusCode(500, new { error = "Failed to fetch player collection" });
        }
    }

    [HttpGet("api/player/{tag}")]
    [RequireMetaLoaded]
    public async Task<IActionResult> WarDecks(
        string tag,
        [FromQuery] string? decks,
        [FromQuery] string? minLevel,
        [FromQuery] string? ban,
        [FromQuery] string? require,
        [FromQuery(Name = "lock")] string[]? locks,
        CancellationToken ct)
    {
        if (!PlayerTag.IsValid(tag))
        {
            return BadRequest(new { error = "Invalid player tag" });
        }
        if (!LineupOptions.TryParse(decks, minLevel, ban, require, locks, out var options, out var optionsError))
        {
            return BadRequest(new { error = optionsError });
        }

        try
        {
            var player = await players.GetPlayerDataAsync(tag, ct);
            if (player.Cards is null)
            {
                return BadRequest(new { error = "Player cards data not found in API response" });
            }

            var warDecks = await deckCache.GetAsync(player, cache.Version, cache.Meta, options, ct);
            stats.NoteServed(tag);

            return Ok(new
            {
                player = new
                {
                    tag = player.Tag,
                    name = player.Name,
                    clanTag = player.Clan?.Tag,
                    clanName = player.Clan?.Name,
                    clanBadgeId = player.Clan?.BadgeId,
                },
                warDecks,
            });
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return NotFound(new { error = "Player not found" });
        }
        catch (CalculationBusyException)
        {
            Response.Headers.RetryAfter = "2";
            Response.Headers.CacheControl = "no-store";
            return StatusCode(503, new { error = "The server is busy. Please try again shortly.", code = "server_busy" });
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Error fetching player data");
            return StatusCode(500, new { error = "Failed to fetch player data" });
        }
    }

    [HttpGet("api/player/{tag}/war-today")]
    public async Task<ActionResult<WarDecksToday>> WarToday(string tag, CancellationToken ct)
    {
        if (!PlayerTag.IsValid(tag))
        {
            return BadRequest();
        }

        try
        {
            var player = await players.GetPlayerDataAsync(tag, ct);
            return await warDecksToday.ReadAsync(player, ct);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return NotFound();
        }
    }
}
