using Microsoft.AspNetCore.Mvc;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

/// <summary>
/// Player-facing endpoints: the recommended war decks for a player and their raw
/// card collection. Both fetch the player from the CR API and map its cards into
/// the domain <see cref="PlayerItemLevel"/> shape.
/// </summary>
[ApiController]
public sealed class PlayerController(
    ClashRoyaleClient client,
    MetaCache cache,
    DeckAnalyzer analyzer,
    ILogger<PlayerController> logger) : ControllerBase
{
    /// <summary>The player's raw collection, trimmed to what the collection view needs.</summary>
    [HttpGet("api/player/{tag}/collection")]
    public async Task<IActionResult> Collection(string tag, CancellationToken ct)
    {
        try
        {
            var player = await client.GetPlayerDataAsync(tag, ct);
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
        catch (Exception ex)
        {
            logger.LogError(ex, "Error fetching player collection for {Tag}", tag);
            return StatusCode(500, new { error = $"Failed to fetch player collection: {ex.Message}" });
        }
    }

    /// <summary>The four recommended card-disjoint war decks + swap alternatives.</summary>
    [HttpGet("api/player/{tag}")]
    public async Task<IActionResult> WarDecks(string tag, CancellationToken ct)
    {
        try
        {
            var player = await client.GetPlayerDataAsync(tag, ct);
            if (player.Cards is null)
            {
                return BadRequest(new { error = "Player cards data not found in API response" });
            }

            var playerCards = player.Cards.Select(ToPlayerItemLevel).ToList();
            var cardMap = new Dictionary<int, PlayerItemLevel>(playerCards.Count);
            foreach (var card in playerCards)
            {
                cardMap[card.Id] = card;
            }

            var warDecks = analyzer.FindBestWarDecks(playerCards, cache.Meta, cardMap);

            return Ok(new
            {
                player = new { tag = player.Tag, name = player.Name },
                warDecks,
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error fetching player data for {Tag}", tag);
            return StatusCode(500, new { error = $"Failed to fetch player data: {ex.Message}" });
        }
    }

    private static PlayerItemLevel ToPlayerItemLevel(CrPlayerCard c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        Level = c.Level,
        MaxLevel = c.MaxLevel,
        EvolutionLevel = c.EvolutionLevel ?? 0,
        ElixirCost = c.ElixirCost,
        Rarity = RarityExtensions.ParseRarity(c.Rarity),
        IconUrls = c.IconUrls,
    };
}
