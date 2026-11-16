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
public sealed class CrownSeriesController(
    PlayerProfileCache players,
    CrownSeriesMeta meta,
    CrownSeriesDeckCache deckCache,
    StatsRecorder stats,
    ILogger<CrownSeriesController> logger) : ControllerBase
{
    private const int MinDecks = 3;

    [HttpGet("api/player/{tag}/crown-series")]
    public async Task<IActionResult> DuelDeck(
        string tag,
        [FromQuery] string? league,
        CancellationToken ct,
        [FromQuery] int decks = LineupOptions.MaxDecks)
    {
        if (!PlayerTag.IsValid(tag))
        {
            return BadRequest(new { error = "Invalid player tag" });
        }
        if (!CrownSeriesLeagueExtensions.TryParse(league, out var parsedLeague))
        {
            return BadRequest(new { error = "Unknown league" });
        }
        if (decks is < MinDecks or > LineupOptions.MaxDecks)
        {
            return BadRequest(new { error = "A Duel Deck has 3 or 4 decks" });
        }
        var current = meta.Current;
        if (current.Decks.Count == 0)
        {
            Response.Headers.CacheControl = "no-store";
            return StatusCode(503, new { error = "No Crown Series Duels have been collected yet", code = "no_duel_data" });
        }

        try
        {
            var player = await players.GetPlayerDataAsync(tag, ct);
            if (player.Cards is null)
            {
                return BadRequest(new { error = "Player cards data not found in API response" });
            }

            var lineup = await deckCache.GetAsync(player, parsedLeague, decks, ct);
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
                league = parsedLeague,
                levelCap = parsedLeague.LevelCap(),
                duelRounds = current.Rounds,
                duelDecks = lineup,
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
            logger.LogError(ex, "Error building Crown Series decks");
            return StatusCode(500, new { error = "Failed to build Crown Series decks" });
        }
    }
}
