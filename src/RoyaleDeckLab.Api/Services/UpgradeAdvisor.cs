using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class UpgradeAdvisor(DeckAnalyzer analyzer)
{
    private const double MinDelta = 5e-4;
    private const int PopularityPrior = 8;

    public UpgradeAdvice Advise(IReadOnlyList<PlayerItemLevel> playerCards, IReadOnlyList<DeckMeta> metaDecks)
    {
        var cardMap = playerCards.ToDictionary(c => c.Id);
        var fieldable = DeckAnalyzer.SortCandidates(analyzer.ScoreFieldableDecks(metaDecks, cardMap));
        var baseline = analyzer.SelectLineup(fieldable, cardMap, includeAlternatives: false, assumeSorted: true);
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
            var unchanged = new List<(DeckMeta deck, double score)>(fieldable.Count);
            var changed = new List<(DeckMeta deck, double score)>();
            foreach (var (deck, score) in fieldable)
            {
                if (deck.CardIds.Contains(modified.Id))
                {
                    changed.Add((deck, analyzer.ScoreDeckForPlayer(simulatedMap, deck, deck.CardVersions) ?? score));
                }
                else
                {
                    unchanged.Add((deck, score));
                }
            }
            var adjusted = MergeByRank(unchanged, DeckAnalyzer.SortCandidates(changed));
            var result = analyzer.SelectLineup(adjusted, simulatedMap, includeAlternatives: false, assumeSorted: true);
            return (result.TotalScore - baseline.TotalScore, result);
        }

        bool ChangesLineup(WarDeckResult result) => !LineupKeys(result).SetEquals(baselineKeys);

        BestDeckEntry? UnlockedDeck(WarDeckResult result, int cardId)
        {
            var newDecks = result.Decks
                .Where(d => !baselineKeys.Contains(MetaCache.DeckKey(d.CardIds)))
                .ToList();
            var deck = newDecks.FirstOrDefault(d => d.CardIds.Contains(cardId)) ?? newDecks.FirstOrDefault();
            return deck is null ? null : ToEntry(deck);
        }

        var suggestions = new List<UpgradeSuggestion>();
        void Emit(PlayerItemLevel card, string kind, int toLevel, double delta, WarDeckResult result)
        {
            var changesLineup = ChangesLineup(result);
            suggestions.Add(new UpgradeSuggestion(
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
                ChangesLineup: changesLineup,
                AffectedDeckIndexes: AffectedIndexes(baseline, card.Id, kind),
                UnlockedDeck: changesLineup ? UnlockedDeck(result, card.Id) : null));
        }

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

    private static List<(DeckMeta deck, double score)> MergeByRank(
        List<(DeckMeta deck, double score)> unchanged,
        List<(DeckMeta deck, double score)> changed)
    {
        if (changed.Count == 0)
        {
            return unchanged;
        }
        var merged = new List<(DeckMeta deck, double score)>(unchanged.Count + changed.Count);
        int i = 0, j = 0;
        while (i < unchanged.Count && j < changed.Count)
        {
            merged.Add(DeckAnalyzer.CompareCandidates(unchanged[i], changed[j]) <= 0
                ? unchanged[i++]
                : changed[j++]);
        }
        merged.AddRange(unchanged.Skip(i));
        merged.AddRange(changed.Skip(j));
        return merged;
    }

    private static BestDeckEntry ToEntry(ScoredDeck deck)
    {
        var cards = deck.Cards
            .Select(c => new BestDeckCard(c.Id, c.Name ?? string.Empty, c.MaxLevel, c.ElixirCost,
                c.Rarity.ToString().ToLowerInvariant(), c.IconUrls))
            .ToList();
        var pop = deck.Players <= 0 ? 1.0 : (double)deck.Players / (deck.Players + PopularityPrior);
        return new BestDeckEntry(
            CardIds: deck.CardIds,
            WinRate: deck.MetaWinRate,
            Confidence: deck.Confidence,
            Uses: deck.Uses,
            Players: deck.Players,
            PickRate: deck.PickRate,
            MetaScore: deck.Confidence * pop,
            CardVersions: deck.MetaCardVersions ?? deck.CardVersions ?? [],
            Cards: cards);
    }

    private static HashSet<string> LineupKeys(WarDeckResult result)
        => result.Decks.Select(d => MetaCache.DeckKey(d.CardIds)).ToHashSet();

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
