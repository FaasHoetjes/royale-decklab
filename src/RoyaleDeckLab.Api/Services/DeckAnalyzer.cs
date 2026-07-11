using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class DeckAnalyzer
{
    // Slot 1 takes an Evo, slot 2 a Hero, slot 3 either; caps are a safety net,
    // correct meta data already respects them.
    private const int MaxEvo = 2;
    private const int MaxHero = 2;
    private const int MaxSpecials = 3;

    // CR card stats compound ~10% per level; meta win rates are measured at maxed levels.
    private const double StatGrowthPerLevel = 1.10;

    private const double BattleCompoundingExponent = 4.0;

    // ~6% weaker per missing special version, compounding across the deck.
    private const double MissingSpecialMultiplier = 0.94;

    private const int MinDistinctPlayers = 5;
    private const int PopularityPrior = 8;
    private const double NeutralWinRate = 0.5;
    private const int AlternativePoolSize = 60;

    private static readonly int[] PopularityGateLadder = [MinDistinctPlayers, 3, 2, 1];

    private const int DecksPerLineup = 4;

    private const long SearchNodeBudget = 2_000_000;

    public sealed record BuilderScore(double Score, double WinRate, double Fieldability, bool IsMeta, int Players);

    private static bool IsChampion(int cardId, IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
        => cardMap.TryGetValue(cardId, out var card) && card.Rarity == Rarity.Champion;

    private static double PopularityFactor(int? players)
    {
        if (players is null)
        {
            return 1;
        }
        if (players <= 0)
        {
            return 0;
        }
        return (double)players.Value / (players.Value + PopularityPrior);
    }

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
            var ownsVersion = v.Version == CardVersionKind.Hero ? owned >= 2 : owned >= 1;
            if (ownsVersion)
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
            if (owned >= 2 && hero < MaxHero && total < MaxSpecials)
            {
                hero++;
                total++;
                changed = true;
                upgraded.Add(new CardVersion(v.CardId, CardVersionKind.Hero));
            }
            else if (owned == 1 && evo < MaxEvo && total < MaxSpecials)
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
    {
        double totalStatFraction = 0;
        var versionFit = 1.0;
        var validCards = 0;

        foreach (var cardId in metaDeck.CardIds)
        {
            if (!cardMap.TryGetValue(cardId, out var playerCard))
            {
                return null;
            }

            var levelsBelowMax = Math.Max(0, playerCard.MaxLevel - playerCard.Level);
            totalStatFraction += Math.Pow(StatGrowthPerLevel, -levelsBelowMax);
            validCards++;

            if (cardVersions is not null && !IsChampion(cardId, cardMap))
            {
                var metaCardVersion = cardVersions.FirstOrDefault(c => c.CardId == cardId);
                if (metaCardVersion is not null)
                {
                    var playerEvoLevel = playerCard.EvolutionLevel;
                    var missingHero = metaCardVersion.Version == CardVersionKind.Hero && playerEvoLevel < 2;
                    var missingEvo = metaCardVersion.Version == CardVersionKind.Evo && playerEvoLevel < 1;
                    if (missingHero || missingEvo)
                    {
                        versionFit *= MissingSpecialMultiplier;
                    }
                }
            }
        }

        var avgStatFraction = totalStatFraction / validCards;
        var expectedWinRate = LevelAdjustedWinRate(metaDeck.Confidence, avgStatFraction);
        return expectedWinRate * versionFit * PopularityFactor(metaDeck.Players);
    }

    private static double LevelAdjustedWinRate(double winRate, double statFraction)
    {
        if (winRate <= 0)
        {
            return 0;
        }
        if (winRate >= 1)
        {
            return 1;
        }
        var odds = winRate / (1 - winRate) * Math.Pow(statFraction, BattleCompoundingExponent);
        return odds / (1 + odds);
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
            var ownsVersion = v.Version == CardVersionKind.Hero ? owned >= 2 : owned >= 1;
            if (!ownsVersion)
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

        var neutral = LevelAdjustedWinRate(NeutralWinRate, fieldability.Value) * PopularityFactor(1);
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
        IReadOnlyList<(DeckMeta deck, double score)> pool)
    {
        var n = pool.Count;
        if (n == 0)
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

        var prefix = new double[n + 1];
        for (var i = 0; i < n; i++)
        {
            prefix[i + 1] = prefix[i] + pool[i].score;
        }

        var bestPicks = GreedyPicks(pool, masks, words);
        var bestCount = bestPicks.Length;
        var bestScore = 0.0;
        foreach (var p in bestPicks)
        {
            bestScore += pool[p].score;
        }

        var usedAt = new ulong[DecksPerLineup + 1][];
        for (var d = 0; d <= DecksPerLineup; d++)
        {
            usedAt[d] = new ulong[words];
        }
        var picks = new int[DecksPerLineup];
        var nodes = 0L;

        void Search(int start, int depth, double score)
        {
            var used = usedAt[depth];
            for (var i = start; i < n; i++)
            {
                var take = Math.Min(DecksPerLineup - depth, n - i);
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

                picks[depth] = i;
                var newScore = score + pool[i].score;
                if (depth + 1 > bestCount || (depth + 1 == bestCount && newScore > bestScore))
                {
                    bestCount = depth + 1;
                    bestScore = newScore;
                    bestPicks = picks[..(depth + 1)];
                }
                if (depth + 1 < DecksPerLineup)
                {
                    var next = usedAt[depth + 1];
                    for (var w = 0; w < words; w++)
                    {
                        next[w] = used[w] | mask[w];
                    }
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

    private static int[] GreedyPicks(
        IReadOnlyList<(DeckMeta deck, double score)> pool, ulong[][] masks, int words)
    {
        var used = new ulong[words];
        var picks = new List<int>(DecksPerLineup);
        for (var i = 0; i < pool.Count && picks.Count < DecksPerLineup; i++)
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
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
        => SelectLineup(ScoreFieldableDecks(metaDecks, cardMap), cardMap, includeAlternatives: true);

    public List<(DeckMeta deck, double score)> ScoreFieldableDecks(
        IReadOnlyList<DeckMeta> metaDecks,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        var fieldable = new List<(DeckMeta deck, double score)>();
        foreach (var metaDeck in metaDecks)
        {
            var score = ScoreDeckForPlayer(cardMap, metaDeck, metaDeck.CardVersions);
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

    public WarDeckResult SelectLineup(
        IReadOnlyList<(DeckMeta deck, double score)> fieldable,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        bool includeAlternatives,
        bool assumeSorted = false)
    {
        var sorted = assumeSorted ? fieldable : SortCandidates(fieldable);

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
            lineup = FindOptimalLineup(pool);
            if (lineup.Count >= DecksPerLineup)
            {
                break;
            }
        }

        var selected = new HashSet<DeckMeta>();
        var selectedDecks = new List<ScoredDeck>(lineup.Count);
        foreach (var (deck, score) in lineup)
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
