using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Ranks the player's possible card upgrades by how much each one raises the
/// total score of their recommended war lineup. Each candidate is simulated one
/// level higher and the full recommendation is re-run, so an upgrade that
/// promotes a *different* deck into the top four is measured too, not just
/// improvements to the current picks. Stateless (registered as a singleton).
/// </summary>
public sealed class UpgradeAdvisor(DeckAnalyzer analyzer)
{
    private const int MaxSuggestions = 10;

    // Deltas at or below this are float noise, not a real improvement.
    private const double MinDelta = 1e-9;

    public UpgradeAdvice Advise(IReadOnlyList<PlayerItemLevel> playerCards, IReadOnlyList<DeckMeta> metaDecks)
    {
        var cardMap = playerCards.ToDictionary(c => c.Id);
        var baseline = analyzer.FindBestWarDecks(playerCards, metaDecks, cardMap);
        var baselineKeys = LineupKeys(baseline);

        // A card in no meta deck can't move any deck's score — skip it up front.
        var metaCardIds = new HashSet<int>();
        foreach (var deck in metaDecks)
        {
            metaCardIds.UnionWith(deck.CardIds);
        }

        var suggestions = new List<UpgradeSuggestion>();
        foreach (var card in playerCards)
        {
            if (card.Level >= card.MaxLevel || !metaCardIds.Contains(card.Id))
            {
                continue;
            }

            var upgraded = card with { Level = card.Level + 1 };
            var simulatedCards = playerCards.Select(c => c.Id == card.Id ? upgraded : c).ToList();
            var simulatedMap = new Dictionary<int, PlayerItemLevel>(cardMap) { [card.Id] = upgraded };
            var result = analyzer.FindBestWarDecks(simulatedCards, metaDecks, simulatedMap);

            var delta = result.TotalScore - baseline.TotalScore;
            if (delta <= MinDelta)
            {
                continue;
            }

            suggestions.Add(new UpgradeSuggestion(
                CardId: card.Id,
                Name: card.Name,
                FromLevel: card.Level,
                ToLevel: card.Level + 1,
                MaxLevel: card.MaxLevel,
                ElixirCost: card.ElixirCost,
                IconUrls: card.IconUrls,
                ScoreDelta: delta,
                NewTotalScore: result.TotalScore,
                ChangesLineup: !LineupKeys(result).SetEquals(baselineKeys),
                AffectedDeckIndexes: AffectedIndexes(baseline, card.Id)));
        }

        var ranked = suggestions
            .OrderByDescending(s => s.ScoreDelta)
            .ThenBy(s => s.Name)
            .Take(MaxSuggestions)
            .ToList();
        return new UpgradeAdvice(baseline.TotalScore, ranked);
    }

    /// <summary>Identity of a lineup: the set of its decks' sorted-card keys.</summary>
    private static HashSet<string> LineupKeys(WarDeckResult result)
        => result.Decks.Select(d => MetaCache.DeckKey(d.CardIds)).ToHashSet();

    /// <summary>Baseline deck indexes (0-3) that field the given card.</summary>
    private static List<int> AffectedIndexes(WarDeckResult baseline, int cardId)
    {
        var indexes = new List<int>();
        for (var i = 0; i < baseline.Decks.Count; i++)
        {
            if (baseline.Decks[i].CardIds.Contains(cardId))
            {
                indexes.Add(i);
            }
        }
        return indexes;
    }
}
