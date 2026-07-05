using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Ranks the player's possible upgrades by how much each one raises the total
/// score of their recommended war lineup. Each candidate is simulated and the
/// full recommendation re-run, so an upgrade that promotes a *different* deck
/// into the top four is measured too, not just improvements to the current
/// picks. Three candidate kinds: one card level, the smallest multi-level jump
/// that changes the lineup (when one level isn't enough), and Evolution/Hero
/// unlocks the meta actually fields. Stateless (registered as a singleton).
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
        // pool it never reads; together that turns seconds into milliseconds.
        var fieldable = analyzer.ScoreFieldableDecks(metaDecks, cardMap);
        var baseline = analyzer.SelectLineup(fieldable, cardMap, includeAlternatives: false);
        var baselineKeys = LineupKeys(baseline);

        // A card in no meta deck can't move any deck's score, so skip it up front.
        // Likewise a special version no meta deck fields: unlocking it removes no
        // penalty, so only versions in these sets are unlock candidates.
        var metaCardIds = new HashSet<int>();
        var evoFielded = new HashSet<int>();
        var heroFielded = new HashSet<int>();
        foreach (var deck in metaDecks)
        {
            metaCardIds.UnionWith(deck.CardIds);
            foreach (var v in deck.CardVersions ?? [])
            {
                if (v.Version == CardVersionKind.Evo)
                {
                    evoFielded.Add(v.CardId);
                }
                else if (v.Version == CardVersionKind.Hero)
                {
                    heroFielded.Add(v.CardId);
                }
            }
        }

        // One candidate: swap the modified card into the collection, rescore only
        // the decks fielding it (every other deck keeps its baseline score; the
        // rescore can't be null: the deck was fieldable before and the simulated
        // collection has the same cards), and re-run the lineup selection.
        (double Delta, WarDeckResult Result) Simulate(PlayerItemLevel modified)
        {
            var simulatedMap = new Dictionary<int, PlayerItemLevel>(cardMap) { [modified.Id] = modified };
            var adjusted = new List<(DeckMeta deck, double score)>(fieldable.Count);
            foreach (var (deck, score) in fieldable)
            {
                adjusted.Add(deck.CardIds.Contains(modified.Id)
                    ? (deck, analyzer.ScoreDeckForPlayer(simulatedMap, deck, deck.CardVersions) ?? score)
                    : (deck, score));
            }
            var result = analyzer.SelectLineup(adjusted, simulatedMap, includeAlternatives: false);
            return (result.TotalScore - baseline.TotalScore, result);
        }

        bool ChangesLineup(WarDeckResult result) => !LineupKeys(result).SetEquals(baselineKeys);

        var suggestions = new List<UpgradeSuggestion>();
        void Emit(PlayerItemLevel card, string kind, int toLevel, double delta, WarDeckResult result)
            => suggestions.Add(new UpgradeSuggestion(
                CardId: card.Id,
                Name: card.Name,
                Kind: kind,
                FromLevel: card.Level,
                ToLevel: toLevel,
                MaxLevel: card.MaxLevel,
                ElixirCost: card.ElixirCost,
                IconUrls: card.IconUrls,
                ScoreDelta: delta,
                NewTotalScore: result.TotalScore,
                ChangesLineup: ChangesLineup(result),
                AffectedDeckIndexes: AffectedIndexes(baseline, card.Id, kind)));

        // Candidates actually simulated. Zero means the collection is maxed for
        // this meta (every meta card at max level, every fielded special owned)
        // which the client reports differently from "nothing helps".
        var candidates = 0;

        foreach (var card in playerCards)
        {
            if (!metaCardIds.Contains(card.Id))
            {
                continue;
            }

            if (card.Level < card.MaxLevel)
            {
                candidates++;
                var (delta, result) = Simulate(card with { Level = card.Level + 1 });
                var oneLevelChangesLineup = ChangesLineup(result);
                if (delta > MinDelta)
                {
                    Emit(card, UpgradeKind.Level, card.Level + 1, delta, result);
                }

                // When one level doesn't already promote a new deck, ask whether
                // ANY number of levels would: simulate straight at max level, and if
                // even a maxed card leaves the lineup unchanged, no smaller jump
                // can move it and the per-level scan is skipped entirely. When it
                // does change, report the cheapest jump that gets there.
                if (!oneLevelChangesLineup && card.MaxLevel > card.Level + 1)
                {
                    var (maxDelta, maxResult) = Simulate(card with { Level = card.MaxLevel });
                    if (ChangesLineup(maxResult) && maxDelta > MinDelta)
                    {
                        var (jumpLevel, jumpDelta, jumpResult) = (card.MaxLevel, maxDelta, maxResult);
                        for (var to = card.Level + 2; to < card.MaxLevel; to++)
                        {
                            var (d, r) = Simulate(card with { Level = to });
                            if (ChangesLineup(r))
                            {
                                (jumpLevel, jumpDelta, jumpResult) = (to, d, r);
                                break;
                            }
                        }
                        Emit(card, UpgradeKind.Level, jumpLevel, jumpDelta, jumpResult);
                    }
                }
            }

            // Evolution / Hero unlocks. Champions are neither: owning the card IS
            // owning the champion, and scoring never penalizes them. Ownership is
            // the cumulative evolutionLevel (1 = evo, 2 = hero), so an unlock is
            // simulated by raising it to the tier the meta decks field.
            if (card.Rarity != Rarity.Champion)
            {
                if (card.EvolutionLevel < 1 && evoFielded.Contains(card.Id))
                {
                    candidates++;
                    var (delta, result) = Simulate(card with { EvolutionLevel = 1 });
                    if (delta > MinDelta)
                    {
                        Emit(card, UpgradeKind.Evo, card.Level, delta, result);
                    }
                }
                if (card.EvolutionLevel < 2 && heroFielded.Contains(card.Id))
                {
                    candidates++;
                    var (delta, result) = Simulate(card with { EvolutionLevel = 2 });
                    if (delta > MinDelta)
                    {
                        Emit(card, UpgradeKind.Hero, card.Level, delta, result);
                    }
                }
            }
        }

        // Every positive suggestion is returned (the pool is bounded by the
        // player's upgradeable meta cards); the client decides how many to show
        // and can filter for lineup-changing upgrades that rank below the
        // incremental boosts to the current decks.
        var ranked = suggestions
            .OrderByDescending(s => s.ScoreDelta)
            .ThenBy(s => s.Name)
            .ThenBy(s => s.Kind)
            .ToList();
        return new UpgradeAdvice(baseline.TotalScore, ranked, CollectionMaxed: candidates == 0);
    }

    /// <summary>Identity of a lineup: the set of its decks' sorted-card keys.</summary>
    private static HashSet<string> LineupKeys(WarDeckResult result)
        => result.Decks.Select(d => MetaCache.DeckKey(d.CardIds)).ToHashSet();

    /// <summary>
    /// Baseline deck indexes (0-3) the change can move: for a level, every deck
    /// fielding the card; for an unlock, only decks fielding that special version
    /// (a deck running the normal version gains nothing from the unlock).
    /// </summary>
    private static List<int> AffectedIndexes(WarDeckResult baseline, int cardId, string kind)
    {
        var version = kind switch
        {
            UpgradeKind.Evo => CardVersionKind.Evo,
            UpgradeKind.Hero => CardVersionKind.Hero,
            _ => (CardVersionKind?)null,
        };

        var indexes = new List<int>();
        for (var i = 0; i < baseline.Decks.Count; i++)
        {
            var deck = baseline.Decks[i];
            var affected = version is null
                ? deck.CardIds.Contains(cardId)
                : deck.MetaCardVersions?.Any(v => v.CardId == cardId && v.Version == version) ?? false;
            if (affected)
            {
                indexes.Add(i);
            }
        }
        return indexes;
    }
}
