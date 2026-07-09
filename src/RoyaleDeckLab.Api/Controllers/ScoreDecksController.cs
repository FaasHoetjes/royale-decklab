using Microsoft.AspNetCore.Mvc;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class ScoreDecksController(MetaCache cache, DeckAnalyzer analyzer) : ControllerBase
{
    // Hard input caps: the builder UI posts one collection (~120 cards exist in
    // the game) and exactly four 8-slot decks; scoring cost scales with cards ×
    // decks, so reject anything materially bigger before doing any work.
    private const int MaxCards = 250;
    private const int MaxDecks = 8;
    private const int MaxDeckSlots = 8;

    [HttpPost("api/score-decks")]
    public IActionResult ScoreDecks([FromBody] ScoreDecksRequest request)
    {
        var cards = request.Cards ?? [];
        var decks = request.Decks ?? [];
        if (cards.Count > MaxCards)
        {
            return BadRequest(new { error = $"Too many cards (max {MaxCards})" });
        }
        if (decks.Count > MaxDecks)
        {
            return BadRequest(new { error = $"Too many decks (max {MaxDecks})" });
        }
        if (decks.Any(d => d is { Count: > MaxDeckSlots }))
        {
            return BadRequest(new { error = $"A deck has too many slots (max {MaxDeckSlots})" });
        }

        var cardMap = new Dictionary<int, PlayerItemLevel>(cards.Count);
        foreach (var c in cards)
        {
            cardMap[c.Id] = new PlayerItemLevel
            {
                Id = c.Id,
                Level = c.Level,
                MaxLevel = c.MaxLevel,
                EvolutionLevel = c.EvolutionLevel,
                Rarity = RarityExtensions.ParseRarity(c.Rarity),
            };
        }

        var index = cache.GetMetaIndex();

        var scored = decks.Select(deck =>
        {
            // Positional slot array is needed too: which slot an owned evo/hero
            // sits in decides whether it actually fields (see PlacementFit).
            var slots = deck ?? [];
            var cardIds = slots.Where(id => id.HasValue).Select(id => id!.Value).ToList();
            if (cardIds.Count == 0)
            {
                return new BuilderDeckScore(Score: null, IsMeta: false, WinRate: null, Fieldability: null, Players: null);
            }

            DeckMeta? meta = cardIds.Count == 8 && index.TryGetValue(MetaCache.DeckKey(cardIds), out var m) ? m : null;
            var result = analyzer.ScoreBuilderDeck(cardMap, cardIds, meta, slots);
            if (result is null)
            {
                return new BuilderDeckScore(Score: null, IsMeta: false, WinRate: null, Fieldability: null, Players: null);
            }

            return new BuilderDeckScore(result.Score, result.IsMeta, result.WinRate, result.Fieldability, result.Players);
        }).ToList();

        var total = scored.Sum(d => d.Score ?? 0);
        return Ok(new { decks = scored, total });
    }
}
