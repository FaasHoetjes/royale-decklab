using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

/// <summary>
/// Player-facing endpoints: the recommended war decks for a player and their raw
/// card collection. Both fetch the player through the short-lived profile cache
/// (the SPA hits several player endpoints per tag) and map its cards into the
/// domain <see cref="PlayerItemLevel"/> shape.
/// </summary>
[ApiController]
[EnableRateLimiting(RateLimitPolicies.Player)]
public sealed class PlayerController(
    PlayerProfileCache players,
    MetaCache cache,
    DeckAnalyzer analyzer,
    ILogger<PlayerController> logger) : ControllerBase
{
    /// <summary>The player's raw collection, trimmed to what the collection view needs.</summary>
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
            // Detail stays in the log; an HttpRequestException message carries
            // the full upstream URI, which doesn't belong in a public response.
            logger.LogError(ex, "Error fetching player collection for {Tag}", tag);
            return StatusCode(500, new { error = "Failed to fetch player collection" });
        }
    }

    /// <summary>The four recommended card-disjoint war decks + swap alternatives.</summary>
    [HttpGet("api/player/{tag}")]
    public async Task<IActionResult> WarDecks(string tag, CancellationToken ct)
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

            var playerCards = player.Cards.Select(c => c.ToPlayerItemLevel()).ToList();
            var cardMap = new Dictionary<int, PlayerItemLevel>(playerCards.Count);
            foreach (var card in playerCards)
            {
                cardMap[card.Id] = card;
            }

            var warDecks = analyzer.FindBestWarDecks(cache.Meta, cardMap);

            return Ok(new
            {
                player = new { tag = player.Tag, name = player.Name },
                warDecks,
            });
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return NotFound(new { error = "Player not found" });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error fetching player data for {Tag}", tag);
            return StatusCode(500, new { error = "Failed to fetch player data" });
        }
    }
}
