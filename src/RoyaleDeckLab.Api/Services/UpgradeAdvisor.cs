using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class UpgradeAdvisor(DeckAnalyzer analyzer)
{
    private const double MinDelta = 1e-9;

    public UpgradeAdvice Advise(IReadOnlyList<PlayerItemLevel> playerCards, IReadOnlyList<DeckMeta> metaDecks)
    {
        var cardMap = playerCards.ToDictionary(c => c.Id);
        var fieldable = analyzer.ScoreFieldableDecks(metaDecks, cardMap);
        var baseline = analyzer.SelectLineup(fieldable, cardMap, includeAlternatives: false);
        var baselineKeys = LineupKeys(baseline);

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

            // Champions are neither evo nor hero: owning the card IS owning the
            // champion, and scoring never penalizes them. Ownership of evo/hero is
            // the cumulative evolutionLevel (1 = evo, 2 = hero).
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

        var ranked = suggestions
            .OrderByDescending(s => s.ScoreDelta)
            .ThenBy(s => s.Name)
            .ThenBy(s => s.Kind)
            .ToList();
        return new UpgradeAdvice(baseline.TotalScore, ranked, CollectionMaxed: candidates == 0);
    }

    private static HashSet<string> LineupKeys(WarDeckResult result)
        => result.Decks.Select(d => MetaCache.DeckKey(d.CardIds)).ToHashSet();

    // Unlock upgrades only affect decks fielding that special version, not just the card.
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
