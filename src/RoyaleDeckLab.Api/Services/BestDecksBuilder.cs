using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Builds up to ten diverse sets of four card-disjoint meta decks for the "Best
/// War Decks" page, the collection-independent counterpart to
/// <see cref="DeckAnalyzer.FindBestWarDecks"/>. Stateless (singleton).
/// </summary>
public sealed class BestDecksBuilder
{
    // Its own popularity prior/floor, independent of the meta-cache ranking so this
    // page can tune diversity without shifting the aggregate ordering.
    private const int PopularityPrior = 8;
    private const int MinPlayers = 5;

    // Two decks sharing this many of their 8 cards are treated as the same
    // archetype (the "same build, one card swapped" clones).
    private const int ArchetypeSharedCards = 6;

    // A given deck may appear in at most this many shown sets. Stops one elite deck
    // from dominating every set.
    private const int MaxDeckReuse = 2;

    // Cap the working pool once we have plenty of distinct archetypes.
    private const int ArchetypePoolSize = 150;

    private const int MaxSets = 10;
    private const int DecksPerSet = 4;

    public IReadOnlyList<BestDeckSet> Build(
        IReadOnlyList<DeckMeta> meta,
        IReadOnlyDictionary<int, CatalogCard> catalog)
    {
        var scored = meta
            .Where(d => d.Players is null || d.Players >= MinPlayers)
            .Select(d => (deck: d, score: ScoreMetaDeck(d)))
            .OrderByDescending(x => x.score)
            .ToList();

        var eligible = CollapseToArchetypes(scored);
        var sets = BuildDiverseSets(eligible);

        return sets
            // List.Sort is unstable; OrderByDescending keeps equal-score sets in
            // build order to match the original.
            .OrderByDescending(s => s.totalScore)
            .Select(s => new BestDeckSet(
                s.decks.Select(d => ToEntry(d.deck, d.score, catalog)).ToList(),
                s.totalScore))
            .ToList();
    }

    private static double ScoreMetaDeck(DeckMeta d)
    {
        var p = d.Players;
        var pop = p is null ? 1.0 : (p <= 0 ? 0.0 : (double)p.Value / (p.Value + PopularityPrior));
        return d.Confidence * pop;
    }

    /// <summary>
    /// Collapses near-duplicate decks into archetypes: walking strongest first, keep
    /// a deck only if it shares fewer than <see cref="ArchetypeSharedCards"/> cards
    /// with every deck already kept.
    /// </summary>
    private static List<(DeckMeta deck, double score)> CollapseToArchetypes(
        List<(DeckMeta deck, double score)> scored)
    {
        var eligible = new List<(DeckMeta deck, double score)>();
        foreach (var cand in scored)
        {
            var cardSet = cand.deck.CardIds.ToHashSet();
            var isVariant = eligible.Any(kept => kept.deck.CardIds.Count(cardSet.Contains) >= ArchetypeSharedCards);
            if (!isVariant)
            {
                eligible.Add(cand);
            }
            if (eligible.Count >= ArchetypePoolSize)
            {
                break;
            }
        }
        return eligible;
    }

    /// <summary>
    /// Builds up to ten diverse sets in one budget-aware pass, then relaxes the
    /// reuse budget to top up if a thin meta couldn't yield ten distinct sets.
    /// </summary>
    private static List<(List<(DeckMeta deck, double score)> decks, double totalScore)> BuildDiverseSets(
        List<(DeckMeta deck, double score)> eligible)
    {
        var deckUse = new Dictionary<string, int>();
        var seen = new HashSet<string>();
        var top = new List<(List<(DeckMeta deck, double score)> decks, double totalScore)>();

        static string DeckKeyOf((DeckMeta deck, double score) p) => string.Join(',', p.deck.CardIds);
        bool OverBudget((DeckMeta deck, double score) p) => deckUse.GetValueOrDefault(DeckKeyOf(p)) >= MaxDeckReuse;

        void Pass(bool enforceBudget)
        {
            for (var i = 0; i < eligible.Count && top.Count < MaxSets; i++)
            {
                var seed = eligible[i];
                if (enforceBudget && OverBudget(seed))
                {
                    continue;
                }

                var usedCards = new HashSet<int>(seed.deck.CardIds);
                var picked = new List<(DeckMeta deck, double score)> { seed };
                foreach (var candidate in eligible)
                {
                    if (picked.Count >= DecksPerSet)
                    {
                        break;
                    }
                    if (candidate.deck == seed.deck)
                    {
                        continue;
                    }
                    if (enforceBudget && OverBudget(candidate))
                    {
                        continue;
                    }
                    if (candidate.deck.CardIds.Any(usedCards.Contains))
                    {
                        continue;
                    }
                    foreach (var id in candidate.deck.CardIds)
                    {
                        usedCards.Add(id);
                    }
                    picked.Add(candidate);
                }
                if (picked.Count < DecksPerSet)
                {
                    continue;
                }

                var key = string.Join('|', picked.Select(DeckKeyOf).OrderBy(k => k, StringComparer.Ordinal));
                if (!seen.Add(key))
                {
                    continue;
                }

                foreach (var p in picked)
                {
                    deckUse[DeckKeyOf(p)] = deckUse.GetValueOrDefault(DeckKeyOf(p)) + 1;
                }
                top.Add((picked, picked.Sum(p => p.score)));
            }
        }

        Pass(enforceBudget: true);
        if (top.Count < MaxSets)
        {
            Pass(enforceBudget: false);
        }
        return top;
    }

    /// <summary>
    /// Builds one deck's response entry. Champions are forced to the hero slot by
    /// catalog rarity (the battlelog can't flag them); every other card keeps its
    /// stored version. Unlike the player scorer, evolutions are NOT legal-capped here.
    /// </summary>
    private static BestDeckEntry ToEntry(
        DeckMeta deck,
        double score,
        IReadOnlyDictionary<int, CatalogCard> catalog)
    {
        var rawVersions = new Dictionary<int, CardVersionKind>();
        foreach (var v in deck.CardVersions ?? [])
        {
            rawVersions[v.CardId] = v.Version;
        }

        var cardVersions = deck.CardIds.Select(cardId =>
        {
            catalog.TryGetValue(cardId, out var catalogCard);
            var isChampion = string.Equals(catalogCard?.Rarity, "champion", StringComparison.OrdinalIgnoreCase);
            var version = isChampion ? CardVersionKind.Hero : rawVersions.GetValueOrDefault(cardId, CardVersionKind.Normal);
            return new CardVersion(cardId, version);
        }).ToList();

        var cards = new List<BestDeckCard>(deck.CardIds.Length);
        foreach (var id in deck.CardIds)
        {
            if (catalog.TryGetValue(id, out var c))
            {
                cards.Add(new BestDeckCard(c.Id, c.Name, c.MaxLevel, c.ElixirCost, c.Rarity, c.IconUrls));
            }
        }

        return new BestDeckEntry(
            CardIds: deck.CardIds,
            WinRate: deck.WinRate,
            Confidence: deck.Confidence,
            Uses: deck.Uses,
            Players: deck.Players ?? 0,
            PickRate: deck.PickRate ?? 0,
            MetaScore: score,
            CardVersions: cardVersions,
            Cards: cards);
    }
}
