using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class DeckAnalyzer
{
    // Slot 1 takes an Evo, slot 2 a Hero, slot 3 either; caps are a safety net,
    // correct meta data already respects them.
    private const int MaxEvo = 2;
    private const int MaxHero = 2;
    private const int MaxSpecials = 3;

    // CR card stats compound ~10% per level; only used for the builder's fieldability readout.
    // Scoring uses the war-fitted LevelModel instead.
    private const double StatGrowthPerLevel = 1.10;

    // ~6% weaker per missing special version, compounding across the deck.
    private const double MissingSpecialMultiplier = 0.94;

    private const int MinDistinctPlayers = 5;
    private const double NeutralWinRate = 0.5;

    // A hand-built deck nobody on record plays: damped so it ranks below any proven meta deck.
    private const double UnprovenDeckDampener = 1.0 / 9;
    private const int AlternativePoolSize = 60;

    private static readonly int[] PopularityGateLadder = [MinDistinctPlayers, 3, 2, 1];

    private const int DecksPerLineup = 4;

    private const long SearchNodeBudget = 2_000_000;

    public sealed record BuilderScore(double Score, double WinRate, double Fieldability, bool IsMeta, int Players);

    private static bool IsChampion(int cardId, IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
        => cardMap.TryGetValue(cardId, out var card) && card.Rarity == Rarity.Champion;

    private static List<CardVersion> WithChampionVersions(
        IReadOnlyList<int> cardIds,
        IReadOnlyList<CardVersion>? cardVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        var raw = new Dictionary<int, CardVersionKind>();
        foreach (var v in cardVersions ?? [])
        {
            raw[v.CardId] = v.Version;
        }

        var result = new List<CardVersion>(cardIds.Count);
        foreach (var cardId in cardIds)
        {
            var version = IsChampion(cardId, cardMap)
                ? CardVersionKind.Hero
                : raw.GetValueOrDefault(cardId, CardVersionKind.Normal);
            result.Add(new CardVersion(cardId, version));
        }
        return result;
    }

    private static IReadOnlyList<CardVersion>? CapEvolutions(IReadOnlyList<CardVersion>? cardVersions)
    {
        if (cardVersions is null)
        {
            return null;
        }

        int evo = 0, hero = 0, total = 0;
        var illegal = false;
        var capped = new List<CardVersion>(cardVersions.Count);
        foreach (var v in cardVersions)
        {
            if (v.Version == CardVersionKind.Normal)
            {
                capped.Add(v);
                continue;
            }
            var fitsType = v.Version == CardVersionKind.Evo ? evo < MaxEvo : hero < MaxHero;
            if (fitsType && total < MaxSpecials)
            {
                if (v.Version == CardVersionKind.Evo) { evo++; } else { hero++; }
                total++;
                capped.Add(v);
            }
            else
            {
                illegal = true;
                capped.Add(new CardVersion(v.CardId, CardVersionKind.Normal));
            }
        }
        return illegal ? capped : cardVersions;
    }

    private static IReadOnlyList<CardVersion>? PersonalizeVersions(
        IReadOnlyList<CardVersion>? cardVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        if (cardVersions is null)
        {
            return null;
        }

        var changed = false;
        var personalized = new List<CardVersion>(cardVersions.Count);
        foreach (var v in cardVersions)
        {
            if (v.Version == CardVersionKind.Normal || IsChampion(v.CardId, cardMap))
            {
                personalized.Add(v);
                continue;
            }
            var owned = cardMap.TryGetValue(v.CardId, out var c) ? c.EvolutionLevel : 0;
            if (EvolutionBits.Owns(owned, v.Version))
            {
                personalized.Add(v);
                continue;
            }
            changed = true;
            personalized.Add(new CardVersion(v.CardId, CardVersionKind.Normal));
        }
        return changed ? personalized : cardVersions;
    }

    private static IReadOnlyList<CardVersion>? UpgradeIntoFreeSlots(
        IReadOnlyList<CardVersion>? personalized,
        IReadOnlyList<CardVersion>? metaVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        if (personalized is null || metaVersions is null)
        {
            return personalized;
        }

        int evo = 0, hero = 0, total = 0;
        foreach (var v in metaVersions)
        {
            if (v.Version == CardVersionKind.Evo) { evo++; total++; }
            else if (v.Version == CardVersionKind.Hero) { hero++; total++; }
        }

        var changed = false;
        var upgraded = new List<CardVersion>(personalized.Count);
        for (var i = 0; i < personalized.Count; i++)
        {
            var v = personalized[i];
            if (v.Version != CardVersionKind.Normal || metaVersions[i].Version != CardVersionKind.Normal)
            {
                upgraded.Add(v);
                continue;
            }
            var owned = cardMap.TryGetValue(v.CardId, out var c) ? c.EvolutionLevel : 0;
            if (EvolutionBits.OwnsHero(owned) && hero < MaxHero && total < MaxSpecials)
            {
                hero++;
                total++;
                changed = true;
                upgraded.Add(new CardVersion(v.CardId, CardVersionKind.Hero));
            }
            else if (EvolutionBits.OwnsEvo(owned) && evo < MaxEvo && total < MaxSpecials)
            {
                evo++;
                total++;
                changed = true;
                upgraded.Add(new CardVersion(v.CardId, CardVersionKind.Evo));
            }
            else
            {
                upgraded.Add(v);
            }
        }
        return changed ? upgraded : personalized;
    }

    public double? ScoreDeckForPlayer(
        IReadOnlyList<PlayerItemLevel> playerCards,
        DeckMeta metaDeck,
        IReadOnlyList<CardVersion>? cardVersions)
        => ScoreDeckForPlayer(BuildCardMap(playerCards), metaDeck, cardVersions);

    public double? ScoreDeckForPlayer(
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        DeckMeta metaDeck,
        IReadOnlyList<CardVersion>? cardVersions)
        => ScoreDeckForPlayer(cardMap, metaDeck, cardVersions, LevelModel.OpponentLevel(cardMap.Values));

    /// <param name="opponentLevel">The player's expected war opponent level; callers scoring many decks
    /// (or simulating upgrades, which shouldn't move the opponents) compute it once.</param>
    public double? ScoreDeckForPlayer(
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        DeckMeta metaDeck,
        IReadOnlyList<CardVersion>? cardVersions,
        double opponentLevel)
    {
        var levels = new int[metaDeck.CardIds.Length];
        var versionFit = 1.0;

        for (var i = 0; i < metaDeck.CardIds.Length; i++)
        {
            var cardId = metaDeck.CardIds[i];
            if (!cardMap.TryGetValue(cardId, out var playerCard))
            {
                return null;
            }

            levels[i] = LevelModel.DisplayLevel(playerCard);

            if (cardVersions is not null && !IsChampion(cardId, cardMap))
            {
                var metaCardVersion = cardVersions.FirstOrDefault(c => c.CardId == cardId);
                if (metaCardVersion is not null && !EvolutionBits.Owns(playerCard.EvolutionLevel, metaCardVersion.Version))
                {
                    versionFit *= MissingSpecialMultiplier;
                }
            }
        }

        var expectedWinRate = LevelModel.WinProbability(
            metaDeck.Confidence, LevelModel.LevelLogit(levels, opponentLevel));
        return expectedWinRate * versionFit;
    }

    public double? FieldabilityScore(IReadOnlyList<PlayerItemLevel> playerCards, IReadOnlyList<int> cardIds)
        => FieldabilityScore(BuildCardMap(playerCards), cardIds);

    public double? FieldabilityScore(IReadOnlyDictionary<int, PlayerItemLevel> cardMap, IReadOnlyList<int> cardIds)
    {
        double totalStatFraction = 0;
        var validCards = 0;
        foreach (var cardId in cardIds)
        {
            if (!cardMap.TryGetValue(cardId, out var playerCard))
            {
                return null;
            }
            var levelsBelowMax = Math.Max(0, playerCard.MaxLevel - playerCard.Level);
            totalStatFraction += Math.Pow(StatGrowthPerLevel, -levelsBelowMax);
            validCards++;
        }
        if (validCards == 0)
        {
            return null;
        }
        return totalStatFraction / validCards;
    }

    private static bool SlotCanField(CardVersionKind version, int slotIndex)
        => version == CardVersionKind.Hero ? slotIndex is 1 or 2 : slotIndex is 0 or 2;

    private static double PlacementFit(
        IReadOnlyList<int?> slots,
        IReadOnlyList<CardVersion>? metaVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        if (metaVersions is null)
        {
            return 1;
        }

        var fit = 1.0;
        foreach (var v in metaVersions)
        {
            if (v.Version == CardVersionKind.Normal || IsChampion(v.CardId, cardMap))
            {
                continue;
            }
            var owned = cardMap.TryGetValue(v.CardId, out var card) ? card.EvolutionLevel : 0;
            if (!EvolutionBits.Owns(owned, v.Version))
            {
                continue;
            }

            var fielded = false;
            for (var i = 0; i < slots.Count; i++)
            {
                if (slots[i] == v.CardId)
                {
                    fielded = SlotCanField(v.Version, i);
                    break;
                }
            }
            if (!fielded)
            {
                fit *= MissingSpecialMultiplier;
            }
        }
        return fit;
    }

    public BuilderScore? ScoreBuilderDeck(
        IReadOnlyList<PlayerItemLevel> playerCards,
        IReadOnlyList<int> cardIds,
        DeckMeta? meta,
        IReadOnlyList<int?>? slots = null)
        => ScoreBuilderDeck(BuildCardMap(playerCards), cardIds, meta, slots);

    public BuilderScore? ScoreBuilderDeck(
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        IReadOnlyList<int> cardIds,
        DeckMeta? meta,
        IReadOnlyList<int?>? slots = null)
    {
        var fieldability = FieldabilityScore(cardMap, cardIds);
        if (fieldability is null)
        {
            return null;
        }

        if (meta is not null)
        {
            var score = ScoreDeckForPlayer(cardMap, meta, meta.CardVersions);
            if (score is null)
            {
                return null;
            }
            var placementFit = slots is null ? 1.0 : PlacementFit(slots, meta.CardVersions, cardMap);
            return new BuilderScore(score.Value * placementFit, meta.Confidence, fieldability.Value, IsMeta: true, meta.Players ?? 0);
        }

        var levels = cardIds.Select(id => LevelModel.DisplayLevel(cardMap[id])).ToList();
        var levelLogit = LevelModel.LevelLogit(levels, LevelModel.OpponentLevel(cardMap.Values));
        var neutral = LevelModel.WinProbability(NeutralWinRate, levelLogit) * UnprovenDeckDampener;
        return new BuilderScore(neutral, NeutralWinRate, fieldability.Value, IsMeta: false, Players: 0);
    }

    private static ScoredDeck ToScoredDeck(
        DeckMeta deck,
        double score,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        var cards = new List<PlayerItemLevel>(deck.CardIds.Length);
        foreach (var id in deck.CardIds)
        {
            if (cardMap.TryGetValue(id, out var card))
            {
                cards.Add(card);
            }
        }

        var versions = WithChampionVersions(deck.CardIds, deck.CardVersions, cardMap);
        var metaVersions = CapEvolutions(versions);
        var personalized = UpgradeIntoFreeSlots(
            CapEvolutions(PersonalizeVersions(versions, cardMap)), metaVersions, cardMap);

        return new ScoredDeck
        {
            CardIds = deck.CardIds,
            MetaWinRate = deck.WinRate,
            Confidence = deck.Confidence,
            Uses = deck.Uses,
            Players = deck.Players ?? 0,
            PickRate = deck.PickRate ?? 0,
            PlayerScore = score,
            Cards = cards,
            CardVersions = personalized,
            MetaCardVersions = metaVersions,
        };
    }

    private static List<(DeckMeta deck, double score)> FindOptimalLineup(
        IReadOnlyList<(DeckMeta deck, double score)> pool,
        int target,
        IReadOnlySet<int> requiredCards)
    {
        var n = pool.Count;
        if (n == 0 || target <= 0)
        {
            return [];
        }

        var bitOf = new Dictionary<int, int>();
        foreach (var (deck, _) in pool)
        {
            foreach (var id in deck.CardIds)
            {
                if (!bitOf.ContainsKey(id))
                {
                    bitOf[id] = bitOf.Count;
                }
            }
        }
        var words = (bitOf.Count + 63) >> 6;
        var masks = new ulong[n][];
        for (var i = 0; i < n; i++)
        {
            var mask = new ulong[words];
            foreach (var id in pool[i].deck.CardIds)
            {
                var bit = bitOf[id];
                mask[bit >> 6] |= 1UL << (bit & 63);
            }
            masks[i] = mask;
        }

        // A lineup only counts once it uses every required card; a required card that no deck in the pool has can't be met.
        var required = new ulong[words];
        foreach (var id in requiredCards)
        {
            if (!bitOf.TryGetValue(id, out var bit))
            {
                return [];
            }
            required[bit >> 6] |= 1UL << (bit & 63);
        }
        var hasRequired = requiredCards.Count > 0;

        // reachable[i]: every card in decks i..n-1, to stop early once a missing required card can no longer be added.
        var reachable = new ulong[n + 1][];
        reachable[n] = new ulong[words];
        for (var i = n - 1; i >= 0; i--)
        {
            reachable[i] = new ulong[words];
            for (var w = 0; w < words; w++)
            {
                reachable[i][w] = reachable[i + 1][w] | masks[i][w];
            }
        }

        bool Covers(ulong[] used)
        {
            for (var w = 0; w < words; w++)
            {
                if ((required[w] & ~used[w]) != 0)
                {
                    return false;
                }
            }
            return true;
        }

        var prefix = new double[n + 1];
        for (var i = 0; i < n; i++)
        {
            prefix[i + 1] = prefix[i] + pool[i].score;
        }

        var bestPicks = GreedyPicks(pool, masks, words, target);
        if (hasRequired && !Covers(UnionOf(bestPicks, masks, words)))
        {
            bestPicks = [];
        }
        var bestCount = bestPicks.Length;
        var bestScore = 0.0;
        foreach (var p in bestPicks)
        {
            bestScore += pool[p].score;
        }

        var usedAt = new ulong[target + 1][];
        for (var d = 0; d <= target; d++)
        {
            usedAt[d] = new ulong[words];
        }
        var picks = new int[target];
        var nodes = 0L;

        void Search(int start, int depth, double score)
        {
            var used = usedAt[depth];
            var next = usedAt[depth + 1];
            for (var i = start; i < n; i++)
            {
                var take = Math.Min(target - depth, n - i);
                var boundCount = depth + take;
                var boundScore = score + prefix[i + take] - prefix[i];
                if (boundCount < bestCount || (boundCount == bestCount && boundScore <= bestScore))
                {
                    return;
                }
                if (++nodes > SearchNodeBudget)
                {
                    return;
                }
                if (hasRequired)
                {
                    var reach = reachable[i];
                    for (var w = 0; w < words; w++)
                    {
                        if ((required[w] & ~(used[w] | reach[w])) != 0)
                        {
                            return;
                        }
                    }
                }

                var mask = masks[i];
                var overlaps = false;
                for (var w = 0; w < words; w++)
                {
                    if ((used[w] & mask[w]) != 0)
                    {
                        overlaps = true;
                        break;
                    }
                }
                if (overlaps)
                {
                    continue;
                }

                for (var w = 0; w < words; w++)
                {
                    next[w] = used[w] | mask[w];
                }
                picks[depth] = i;
                var newScore = score + pool[i].score;
                if ((depth + 1 > bestCount || (depth + 1 == bestCount && newScore > bestScore))
                    && (!hasRequired || Covers(next)))
                {
                    bestCount = depth + 1;
                    bestScore = newScore;
                    bestPicks = picks[..(depth + 1)];
                }
                if (depth + 1 < target)
                {
                    Search(i + 1, depth + 1, newScore);
                }
            }
        }
        Search(0, 0, 0);

        var lineup = new List<(DeckMeta deck, double score)>(bestCount);
        foreach (var p in bestPicks)
        {
            lineup.Add(pool[p]);
        }
        return lineup;
    }

    private static ulong[] UnionOf(int[] picks, ulong[][] masks, int words)
    {
        var used = new ulong[words];
        foreach (var p in picks)
        {
            for (var w = 0; w < words; w++)
            {
                used[w] |= masks[p][w];
            }
        }
        return used;
    }

    private static int[] GreedyPicks(
        IReadOnlyList<(DeckMeta deck, double score)> pool, ulong[][] masks, int words, int target)
    {
        var used = new ulong[words];
        var picks = new List<int>(target);
        for (var i = 0; i < pool.Count && picks.Count < target; i++)
        {
            var mask = masks[i];
            var overlaps = false;
            for (var w = 0; w < words; w++)
            {
                if ((used[w] & mask[w]) != 0)
                {
                    overlaps = true;
                    break;
                }
            }
            if (overlaps)
            {
                continue;
            }
            for (var w = 0; w < words; w++)
            {
                used[w] |= mask[w];
            }
            picks.Add(i);
        }
        return [.. picks];
    }

    public WarDeckResult FindBestWarDecks(
        IReadOnlyList<DeckMeta> metaDecks,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        LineupOptions? options = null)
    {
        options ??= LineupOptions.Default;
        var opponent = LevelModel.OpponentLevel(cardMap.Values);
        var locked = ScoreLockedDecks(metaDecks, cardMap, options.LockedDecks, opponent);
        var lockedCards = locked.SelectMany(l => l.deck.CardIds).ToHashSet();

        var candidates = ScoreFieldableDecks(metaDecks, cardMap, opponent)
            .Where(c => IsAllowed(c.deck, cardMap, options, lockedCards))
            .ToList();
        var required = options.RequiredCards.Where(id => !lockedCards.Contains(id)).ToHashSet();

        return SelectLineup(candidates, cardMap, includeAlternatives: true,
            deckCount: options.DeckCount - locked.Count, requiredCards: required, locked: locked);
    }

    private static bool IsAllowed(
        DeckMeta deck,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        LineupOptions options,
        HashSet<int> lockedCards)
    {
        foreach (var id in deck.CardIds)
        {
            if (options.BannedCards.Contains(id) || lockedCards.Contains(id))
            {
                return false;
            }
            if (options.MinLevel is { } min && LevelModel.DisplayLevel(cardMap[id]) < min)
            {
                return false;
            }
        }
        return true;
    }

    // Locked decks are kept even when they have dropped out of the meta since the link was made (scored like an
    // unproven Builder deck then); one with a card the player doesn't own can't be fielded and is skipped.
    private List<(DeckMeta deck, double score)> ScoreLockedDecks(
        IReadOnlyList<DeckMeta> metaDecks,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        IReadOnlyList<int[]> lockedDecks,
        double opponentLevel)
    {
        var locked = new List<(DeckMeta deck, double score)>(lockedDecks.Count);
        if (lockedDecks.Count == 0)
        {
            return locked;
        }

        var byKey = new Dictionary<string, DeckMeta>();
        foreach (var deck in metaDecks)
        {
            byKey.TryAdd(MetaCache.DeckKey(deck.CardIds), deck);
        }

        foreach (var ids in lockedDecks)
        {
            if (!ids.All(cardMap.ContainsKey))
            {
                continue;
            }
            if (byKey.TryGetValue(MetaCache.DeckKey(ids), out var meta)
                && ScoreDeckForPlayer(cardMap, meta, meta.CardVersions, opponentLevel) is { } score)
            {
                locked.Add((meta, score));
                continue;
            }

            var estimate = ScoreBuilderDeck(cardMap, ids, meta: null)!;
            var unproven = new DeckMeta
            {
                CardIds = ids,
                WinRate = estimate.WinRate,
                Confidence = estimate.WinRate,
                Uses = 0,
                Players = 0,
            };
            locked.Add((unproven, estimate.Score));
        }
        return locked;
    }

    public List<(DeckMeta deck, double score)> ScoreFieldableDecks(
        IReadOnlyList<DeckMeta> metaDecks,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        double? opponentLevel = null)
    {
        var opponent = opponentLevel ?? LevelModel.OpponentLevel(cardMap.Values);
        var fieldable = new List<(DeckMeta deck, double score)>();
        foreach (var metaDeck in metaDecks)
        {
            var score = ScoreDeckForPlayer(cardMap, metaDeck, metaDeck.CardVersions, opponent);
            if (score is not null)
            {
                fieldable.Add((metaDeck, score.Value));
            }
        }
        return fieldable;
    }

    public static List<(DeckMeta deck, double score)> SortCandidates(
        IEnumerable<(DeckMeta deck, double score)> fieldable)
        => fieldable
            .OrderByDescending(s => s.score)
            .ThenByDescending(s => s.deck.Players ?? 0)
            .ToList();

    public static int CompareCandidates((DeckMeta deck, double score) x, (DeckMeta deck, double score) y)
    {
        var byScore = y.score.CompareTo(x.score);
        return byScore != 0 ? byScore : (y.deck.Players ?? 0).CompareTo(x.deck.Players ?? 0);
    }

    /// <summary>
    /// Best <paramref name="deckCount"/> decks with no shared cards (more decks first, then total score). Locked decks
    /// come first as-is and count toward the total; the caller has already removed candidates that clash with them.
    /// </summary>
    public WarDeckResult SelectLineup(
        IReadOnlyList<(DeckMeta deck, double score)> fieldable,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        bool includeAlternatives,
        bool assumeSorted = false,
        int deckCount = DecksPerLineup,
        IReadOnlySet<int>? requiredCards = null,
        IReadOnlyList<(DeckMeta deck, double score)>? locked = null)
    {
        var sorted = assumeSorted ? fieldable : SortCandidates(fieldable);
        var required = requiredCards ?? new HashSet<int>();

        var lineup = new List<(DeckMeta deck, double score)>();
        var lastPoolCount = -1;
        foreach (var gate in PopularityGateLadder)
        {
            var pool = sorted.Where(s => s.deck.Players is null || s.deck.Players >= gate).ToList();
            if (pool.Count == lastPoolCount)
            {
                continue;
            }
            lastPoolCount = pool.Count;
            lineup = FindOptimalLineup(pool, deckCount, required);
            if (lineup.Count >= deckCount)
            {
                break;
            }
        }

        var selected = new HashSet<DeckMeta>();
        var selectedDecks = new List<ScoredDeck>((locked?.Count ?? 0) + lineup.Count);
        foreach (var (deck, score) in (locked ?? []).Concat(lineup))
        {
            selected.Add(deck);
            selectedDecks.Add(ToScoredDeck(deck, score, cardMap));
        }

        var alternatives = new List<ScoredDeck>();
        if (includeAlternatives)
        {
            foreach (var (deck, score) in sorted)
            {
                if (alternatives.Count >= AlternativePoolSize)
                {
                    break;
                }
                if (selected.Contains(deck))
                {
                    continue;
                }
                alternatives.Add(ToScoredDeck(deck, score, cardMap));
            }
        }

        return new WarDeckResult
        {
            Decks = selectedDecks,
            TotalScore = selectedDecks.Sum(d => d.PlayerScore),
            Alternatives = alternatives,
        };
    }

    private static Dictionary<int, PlayerItemLevel> BuildCardMap(IReadOnlyList<PlayerItemLevel> playerCards)
    {
        var map = new Dictionary<int, PlayerItemLevel>(playerCards.Count);
        foreach (var card in playerCards)
        {
            map[card.Id] = card;
        }
        return map;
    }
}
