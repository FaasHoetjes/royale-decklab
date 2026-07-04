using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Scores meta decks against a player's collection and assembles the four
/// card-disjoint war decks. Stateless (registered as a singleton). The tuning
/// constants below carry their rationale in comments — they're the one part of
/// the scoring that isn't learned from data.
/// </summary>
public sealed class DeckAnalyzer
{
    // In-game evolution slots: slot 1 takes an Evo, slot 2 a Hero, slot 3 either.
    // So a legal deck has at most 2 Evos, at most 2 Heroes, and at most 3 specials.
    // Correct meta data already respects this; the cap is only a safety net.
    private const int MaxEvo = 2;
    private const int MaxHero = 2;
    private const int MaxSpecials = 3;

    // Clash Royale card stats compound ~10% per level, so a card N levels below its
    // max fields 1.10^-N of full combat stats. Meta win rates are measured at
    // tournament-normalised (maxed) levels, so "maxed" is the reference point.
    private const double StatGrowthPerLevel = 1.10;

    // How harshly to down-rank a deck the player can't field at full strength.
    // 1.0 = score scales directly with the deck's average combat-stat fraction.
    private const double LevelSensitivity = 1.0;

    // Strength lost per special version (Evo/Hero) the meta deck fielded that the
    // player hasn't unlocked. Compounds across the deck: one ≈ 6% weaker, two ≈ 12%.
    private const double MissingSpecialMultiplier = 0.94;

    // Minimum distinct top players who must have run a deck for us to recommend it —
    // a representativeness gate, not a win-rate multiplier. Relaxes downward only
    // (see the ladder), so raising the floor costs thin collections nothing.
    private const int MinDistinctPlayers = 5;

    // Popularity also re-enters as a soft weight above the gate: players/(players +
    // prior), rising with count and saturating, so broadly-adopted decks edge out
    // niche high-variance ones without letting popularity dominate win rate.
    private const int PopularityPrior = 8;

    // The prior win rate for a deck we have no meta data on: a 1v1 coin flip. Keeps
    // a custom deck on the same winRate × fieldability scale as a meta deck.
    private const double NeutralWinRate = 0.5;

    // Extra decks beyond the primary four to return as swap candidates. Meta decks
    // share staples, so most of this pool gets filtered per slot by the UI — hence
    // a generous size so enough survive the per-slot disjointness filter.
    private const int AlternativePoolSize = 60;

    // The adaptive gate: strictest first, falling through only to fill slots the
    // player can't otherwise fill with four disjoint decks. The last step admits
    // even one-off decks as a last resort.
    private static readonly int[] PopularityGateLadder = [MinDistinctPlayers, 3, 2, 1];

    // A war lineup fields four decks.
    private const int DecksPerLineup = 4;

    // Safety valve for the exact lineup search: a pathological pool (thousands of
    // decks with near-identical scores and dense overlaps) could make the
    // branch-and-bound crawl, so past this many visited nodes it returns the best
    // lineup found so far — never worse than the greedy seed. Realistic pools
    // finish in a few thousand nodes.
    private const long SearchNodeBudget = 2_000_000;

    /// <summary>The score + factors for one War Deck Builder deck (see <see cref="ScoreBuilderDeck"/>).</summary>
    public sealed record BuilderScore(double Score, double WinRate, double Fieldability, bool IsMeta, int Players);

    /// <summary>
    /// Champions (Mighty Miner, Golden Knight, …) are a rarity, not an evolution:
    /// always fielded in the champion ("hero") slot with no normal version. The
    /// battlelog's evolutionLevel never flags them, so rarity is the only signal.
    /// </summary>
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

    /// <summary>
    /// Adds champions to a meta deck's stored versions: a champion is forced to the
    /// hero slot by identity (the battlelog can't flag it), every other card keeps
    /// its stored version. One entry per deck card, ordered by the deck's card list.
    /// </summary>
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

    /// <summary>
    /// Enforces the legal evolution-slot limits, downgrading any special beyond the
    /// limits back to normal (first legal ones win). Returns the original list
    /// untouched when it's already legal, so the shared meta cache is never mutated.
    /// </summary>
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

    /// <summary>
    /// Resolves a meta deck's specials down to what THIS player can field for
    /// display: an evo/hero they haven't unlocked is shown as normal. Purely
    /// cosmetic — scoring still uses the real meta versions. Champions are never
    /// downgraded (owning the card means owning the champion). Returns the original
    /// list untouched when nothing changes.
    /// </summary>
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

    /// <summary>
    /// This player's fit for a meta deck: confidence-adjusted win rate × how close
    /// to maxed they can field it × unlocked specials × adoption. Returns null if a
    /// card is missing from their collection.
    /// </summary>
    public double? ScoreDeckForPlayer(
        IReadOnlyList<PlayerItemLevel> playerCards,
        DeckMeta metaDeck,
        IReadOnlyList<CardVersion>? cardVersions)
        => ScoreDeckForPlayer(BuildCardMap(playerCards), metaDeck, cardVersions);

    /// <summary>
    /// Map-based core of ScoreDeckForPlayer, for hot paths that score many decks
    /// against one collection — building the map per deck used to dominate the
    /// Upgrade Advisor's runtime.
    /// </summary>
    public double? ScoreDeckForPlayer(
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        DeckMeta metaDeck,
        IReadOnlyList<CardVersion>? cardVersions)
    {
        double totalStatFraction = 0;
        // Version fit compounds across the deck (a product), so each missing special
        // takes a real bite out of the whole score rather than 1/8 of one card's.
        var versionFit = 1.0;
        var validCards = 0;

        foreach (var cardId in metaDeck.CardIds)
        {
            if (!cardMap.TryGetValue(cardId, out var playerCard))
            {
                return null;
            }

            // Fraction of full combat stats this card fields, from CR's ~10%-per-level
            // curve: each level below the card's max costs ~10%. Rarity-fair.
            var levelsBelowMax = Math.Max(0, playerCard.MaxLevel - playerCard.Level);
            totalStatFraction += Math.Pow(StatGrowthPerLevel, -levelsBelowMax);
            validCards++;

            // Penalty if the meta deck fielded a special the player hasn't unlocked
            // (hero needs evolutionLevel >= 2, evo >= 1). Champions are exempt, and
            // only specials the deck actually fields count.
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
        // Confidence-adjusted win rate (always stored in this port) so small-sample
        // decks don't outrank well-tested ones.
        var metaStrength = metaDeck.Confidence;
        var levelWeight = Math.Pow(avgStatFraction, LevelSensitivity);
        return metaStrength * levelWeight * versionFit * PopularityFactor(metaDeck.Players);
    }

    /// <summary>
    /// The player-controllable strength of an ARBITRARY deck — the level-weight term
    /// on its own (average combat-stat fraction across the deck). No version penalty:
    /// the builder fields exactly the art the player owns. Returns null if a card
    /// isn't in the collection.
    /// </summary>
    public double? FieldabilityScore(IReadOnlyList<PlayerItemLevel> playerCards, IReadOnlyList<int> cardIds)
    {
        var cardMap = BuildCardMap(playerCards);

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
        var avgStatFraction = totalStatFraction / validCards;
        return Math.Pow(avgStatFraction, LevelSensitivity);
    }

    /// <summary>
    /// Scores a single War Deck Builder deck on the same scale as the recommendations.
    /// A known meta deck delegates to <see cref="ScoreDeckForPlayer"/> (identical
    /// formula); an unproven deck gets the neutral win rate and single-player
    /// popularity, keeping it strictly below any recommendable meta deck. Returns
    /// null when the deck is empty or a card isn't in the player's collection.
    /// </summary>
    public BuilderScore? ScoreBuilderDeck(
        IReadOnlyList<PlayerItemLevel> playerCards,
        IReadOnlyList<int> cardIds,
        DeckMeta? meta)
    {
        var fieldability = FieldabilityScore(playerCards, cardIds);
        if (fieldability is null)
        {
            return null;
        }

        if (meta is not null)
        {
            var score = ScoreDeckForPlayer(playerCards, meta, meta.CardVersions);
            if (score is null)
            {
                return null;
            }
            return new BuilderScore(score.Value, meta.Confidence, fieldability.Value, IsMeta: true, meta.Players ?? 0);
        }

        var neutral = NeutralWinRate * fieldability.Value * PopularityFactor(1);
        return new BuilderScore(neutral, NeutralWinRate, fieldability.Value, IsMeta: false, Players: 0);
    }

    /// <summary>Builds the player-facing <see cref="ScoredDeck"/> view of a meta deck.</summary>
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

        // Stored versions can't flag champions, so reconcile them before splitting
        // into the meta (slot-driving) and personalised (art-driving) views.
        var versions = WithChampionVersions(deck.CardIds, deck.CardVersions, cardMap);

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
            CardVersions = CapEvolutions(PersonalizeVersions(versions, cardMap)),
            MetaCardVersions = CapEvolutions(versions),
        };
    }

    /// <summary>
    /// The provably best lineup in a pool (pre-sorted by score descending): most
    /// decks first — a war wants every slot filled — then highest total score.
    /// Branch-and-bound: a branch's upper bound takes the next-best remaining
    /// scores wholesale (a prefix-sum lookup thanks to the sort), and since that
    /// bound only shrinks further down the list, the first failing candidate cuts
    /// off the rest of its level. A greedy pass seeds the incumbent so pruning
    /// bites from the first node, and card sets are bitmasks so a disjointness
    /// check is a couple of word ANDs.
    /// </summary>
    private static List<(DeckMeta deck, double score)> FindOptimalLineup(
        IReadOnlyList<(DeckMeta deck, double score)> pool)
    {
        var n = pool.Count;
        if (n == 0)
        {
            return [];
        }

        // Bitmask per deck over the distinct card ids present in this pool.
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

        // prefix[i] = sum of the i highest scores. The best k decks from position
        // i onward are simply the next k, so a bound is prefix[i+k] - prefix[i].
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

        // One reusable used-cards mask per depth instead of allocating per node.
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
                // Upper bound if the best remaining decks were all disjoint. Count
                // outranks score: fewer filled slots can never win on points.
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

    /// <summary>Best-first greedy fill — the incumbent that seeds the exact search.</summary>
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

    /// <summary>
    /// The four best card-disjoint war decks the player can field, plus a ranked
    /// swap pool. Composed of the two halves below so the Upgrade Advisor can
    /// score the pool once and re-run only the (cheap) selection per simulation.
    /// </summary>
    public WarDeckResult FindBestWarDecks(
        IReadOnlyList<DeckMeta> metaDecks,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
        => SelectLineup(ScoreFieldableDecks(metaDecks, cardMap), cardMap, includeAlternatives: true);

    /// <summary>Scores every meta deck the player can actually field (a missing card disqualifies).</summary>
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

    /// <summary>
    /// Picks the best four card-disjoint decks from a pre-scored pool — exactly,
    /// not greedily: the single strongest deck often hogs staple cards that two
    /// other strong decks both want, and the best TOTAL then skips it (see
    /// <see cref="FindOptimalLineup"/>). The popularity-gate ladder still applies:
    /// the strictest gate whose pool can fill all four slots wins, and only when
    /// four disjoint decks don't exist do looser pools (which are supersets, so
    /// the last search subsumes the earlier ones) get a say. The swap pool is
    /// optional: callers that only read the total score skip building it.
    /// </summary>
    public WarDeckResult SelectLineup(
        IReadOnlyList<(DeckMeta deck, double score)> fieldable,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        bool includeAlternatives)
    {
        // Strength first; player count only breaks exact ties. OrderBy is stable,
        // so equal-score/equal-player decks keep their meta ranking order.
        var sorted = fieldable
            .OrderByDescending(s => s.score)
            .ThenByDescending(s => s.deck.Players ?? 0)
            .ToList();

        var lineup = new List<(DeckMeta deck, double score)>();
        var lastPoolCount = -1;
        foreach (var gate in PopularityGateLadder)
        {
            var pool = sorted.Where(s => s.deck.Players is null || s.deck.Players >= gate).ToList();
            // Gates nest, so an unchanged size means the identical pool — skip it.
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

        // The swap pool: next best-scoring decks not among the four, drawn from the
        // FULL fieldable set (every gate) for archetype diversity. These may overlap
        // each other and the primaries — the UI enforces disjointness at swap time.
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
