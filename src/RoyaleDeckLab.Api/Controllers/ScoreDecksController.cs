using Microsoft.AspNetCore.Mvc;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class ScoreDecksController(MetaCache cache, DeckAnalyzer analyzer) : ControllerBase
{
    private const int MaxCards = 250;
    private const int MaxDecks = 8;
    private const int MaxDeckSlots = LineupOptions.CardsPerDeck;
    private const int MaxRequestBytes = 64 * 1024;

    private static readonly BuilderDeckScore Unscored =
        new(Score: null, IsMeta: false, WinRate: null, Fieldability: null, Players: null, MetaCards: false);

    [HttpPost("api/score-decks")]
    [RequireMetaLoaded]
    [RequestSizeLimit(MaxRequestBytes)]
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
        // A maxed collection meets maxed opponents, so its scores match the level-even meta scores on Best Decks.
        double? opponentLevel = request.Maxed ? LevelModel.MaxDisplayLevel : null;

        var scored = decks.Select(deck => ScoreDeck(deck ?? [], cardMap, index, opponentLevel)).ToList();

        var total = scored.Sum(d => d.Score ?? 0);
        return Ok(new { decks = scored, total });
    }

    private BuilderDeckScore ScoreDeck(
        List<int?> slots,
        Dictionary<int, PlayerItemLevel> cardMap,
        IReadOnlyDictionary<string, DeckMeta> index,
        double? opponentLevel)
    {
        var cardIds = slots.OfType<int>().ToList();
        if (cardIds.Count == 0)
        {
            return Unscored;
        }

        var isFullDeck = cardIds.Count == LineupOptions.CardsPerDeck;
        var meta = isFullDeck && index.TryGetValue(MetaCache.DeckKey(cardIds), out var m) ? m : null;
        var result = analyzer.ScoreBuilderDeck(cardMap, cardIds, meta, slots, opponentLevel);
        if (result is null)
        {
            return Unscored;
        }

        return new BuilderDeckScore(result.Score, result.IsMeta, result.WinRate, result.Fieldability, result.Players, result.MetaCards);
    }
}
