using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;
using RoyaleDeckLab.Api.Services.Stats;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
[EnableRateLimiting(RateLimitPolicies.Player)]
public sealed class LadderController(
    PlayerProfileCache players,
    LadderMeta meta,
    LadderDeckCache deckCache,
    VisitorSeeds visitors,
    StatsRecorder stats,
    ILogger<LadderController> logger) : ControllerBase
{
    [HttpGet("api/player/{tag}/ladder")]
    public async Task<IActionResult> LadderDeck(string tag, [FromQuery] string? mode, CancellationToken ct)
    {
        if (!PlayerTag.IsValid(tag))
        {
            return BadRequest(new { error = "Invalid player tag" });
        }
        if (ParseMode(mode) is not { } parsedMode)
        {
            return BadRequest(new { error = "Unknown mode" });
        }
        if (!meta.IsBuilt)
        {
            Response.Headers.CacheControl = "no-store";
            Response.Headers.RetryAfter = "15";
            return StatusCode(503, new { error = "The ladder decks are still loading, try again in a minute", code = "meta_loading" });
        }

        try
        {
            var player = await players.GetPlayerDataAsync(tag, ct);
            if (player.Cards is null)
            {
                return BadRequest(new { error = "Player cards data not found in API response" });
            }

            if (await deckCache.GetAsync(player, parsedMode, ct) is not { } result)
            {
                Response.Headers.CacheControl = "no-store";
                return StatusCode(503, new { error = "No ladder battles have been collected yet", code = "no_ladder_data" });
            }
            stats.NoteServed(tag);
            visitors.Add(player.Tag);

            return Ok(new
            {
                player = PlayerHeader.From(player),
                mode = parsedMode == LadderMode.TrophyRoad ? "trophy-road" : "ranked",
                trophies = player.Trophies,
                rangeFloor = result.Group.Floor,
                ownRange = result.Group == result.PlayerGroup,
                // Each battle within a range is stored once per player side.
                rangeBattles = result.Range.Sides / 2,
                otherRangeBattles = (int)Math.Round(result.Range.BorrowedSides / 2),
                rangeLevel = Math.Round(result.Range.OpponentLevel, 1),
                ranges = result.Ranges,
                ladderDecks = result.Lineup,
                result.SeasonBoosts,
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
            logger.LogError(ex, "Error building ladder decks");
            return StatusCode(500, new { error = "Failed to build ladder decks" });
        }
    }

    private static LadderMode? ParseMode(string? mode) => mode switch
    {
        "trophy-road" => LadderMode.TrophyRoad,
        "ranked" => LadderMode.Ranked,
        _ => null,
    };
}
