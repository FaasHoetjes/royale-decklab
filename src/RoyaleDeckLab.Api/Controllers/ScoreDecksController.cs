using Microsoft.AspNetCore.Mvc;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

/// <summary>
/// Scores the four decks a player is hand-building in the War Deck Builder. Pure
/// function of the posted cards + the in-memory meta cache — no CR API call — so
/// it's fast enough to call live as the user edits. A deck that exactly matches a
/// meta deck gets its real player score; anything else gets a fieldability-only
/// score flagged <c>isMeta: false</c>.
/// </summary>
[ApiController]
public sealed class ScoreDecksController(MetaCache cache, DeckAnalyzer analyzer) : ControllerBase
{
    [HttpPost("api/score-decks")]
    public IActionResult ScoreDecks([FromBody] ScoreDecksRequest request)
    {
        var playerCards = (request.Cards ?? []).Select(c => new PlayerItemLevel
        {
            Id = c.Id,
            Level = c.Level,
            MaxLevel = c.MaxLevel,
            EvolutionLevel = c.EvolutionLevel,
            Rarity = RarityExtensions.ParseRarity(c.Rarity),
        }).ToList();

        var index = cache.GetMetaIndex();

        var scored = (request.Decks ?? []).Select(deck =>
        {
            var cardIds = (deck ?? []).Where(id => id.HasValue).Select(id => id!.Value).ToList();
            if (cardIds.Count == 0)
            {
                return new BuilderDeckScore(Score: null, IsMeta: false, WinRate: null, Fieldability: null, Players: null);
            }

            // Only a complete eight-card deck can match a meta deck; anything shorter
            // scores on the neutral prior.
            DeckMeta? meta = cardIds.Count == 8 && index.TryGetValue(MetaCache.DeckKey(cardIds), out var m) ? m : null;
            var result = analyzer.ScoreBuilderDeck(playerCards, cardIds, meta);
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
