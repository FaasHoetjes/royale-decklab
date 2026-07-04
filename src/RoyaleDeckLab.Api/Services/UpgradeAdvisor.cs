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
    // Deltas at or below this are float noise, not a real improvement.
    private const double MinDelta = 1e-9;

    public UpgradeAdvice Advise(IReadOnlyList<PlayerItemLevel> playerCards, IReadOnlyList<DeckMeta> metaDecks)
    {
        var cardMap = playerCards.ToDictionary(c => c.Id);
        // Score the whole pool ONCE; each simulation below reuses these scores for
        // every deck the upgraded card isn't in, and skips the swap-alternatives
        // pool it never reads — together that turns seconds into milliseconds.
        var fieldable = analyzer.ScoreFieldableDecks(metaDecks, cardMap);
        var baseline = analyzer.SelectLineup(fieldable, cardMap, includeAlternatives: false);
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
            var simulatedMap = new Dictionary<int, PlayerItemLevel>(cardMap) { [card.Id] = upgraded };

            // Only decks fielding this card can change score; every other deck
            // keeps its baseline score. (The rescore can't be null: the deck was
            // fieldable before and the simulated collection has the same cards.)
            var adjusted = new List<(DeckMeta deck, double score)>(fieldable.Count);
            foreach (var (deck, score) in fieldable)
            {
                adjusted.Add(deck.CardIds.Contains(card.Id)
                    ? (deck, analyzer.ScoreDeckForPlayer(simulatedMap, deck, deck.CardVersions) ?? score)
                    : (deck, score));
            }
            var result = analyzer.SelectLineup(adjusted, simulatedMap, includeAlternatives: false);

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

        // Every positive suggestion is returned (the pool is bounded by the
        // player's upgradeable meta cards); the client decides how many to show
        // and can filter for lineup-changing upgrades that rank below the
        // incremental boosts to the current decks.
        var ranked = suggestions
            .OrderByDescending(s => s.ScoreDelta)
            .ThenBy(s => s.Name)
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
