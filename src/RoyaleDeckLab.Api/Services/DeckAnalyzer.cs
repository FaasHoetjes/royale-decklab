using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class DeckAnalyzer
{
    // CR card stats compound ~10% per level; only used for the builder's fieldability readout.
    // Scoring uses the war-fitted LevelModel instead.
    private const double StatGrowthPerLevel = 1.10;

    private const int MinDistinctPlayers = 5;
    private const double NeutralWinRate = 0.5;

    // A hand-built deck nobody on record plays: damped so it ranks below any proven meta deck.
    private const double UnprovenDeckDampener = 1.0 / 9;
    private const int AlternativePoolSize = 60;

    private static readonly int[] PopularityGateLadder = [MinDistinctPlayers, 3, 2, 1];

    private const int DecksPerLineup = 4;

    public sealed record BuilderScore(double Score, double WinRate, double Fieldability, bool IsMeta, int Players);

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
        long totalLevel = 0;
        var minLevel = int.MaxValue;
        var versionFit = 1.0;

        for (var i = 0; i < metaDeck.CardIds.Length; i++)
        {
            var cardId = metaDeck.CardIds[i];
            if (!cardMap.TryGetValue(cardId, out var playerCard))
            {
                return null;
            }

            var level = LevelModel.DisplayLevel(playerCard);
            totalLevel += level;
            minLevel = Math.Min(minLevel, level);

            if (cardVersions is not null && playerCard.Rarity != Rarity.Champion)
            {
                for (var v = 0; v < cardVersions.Count; v++)
                {
                    var version = cardVersions[v];
                    if (version.CardId != cardId)
                    {
                        continue;
                    }
                    if (!EvolutionBits.Owns(playerCard.EvolutionLevel, version.Version))
                    {
                        versionFit *= CardVersionRules.MissingSpecialMultiplier;
                    }
                    break;
                }
            }
        }

        if (metaDeck.CardIds.Length == 0)
        {
            throw new InvalidOperationException("Sequence contains no elements");
        }
        var meanLevel = (double)totalLevel / metaDeck.CardIds.Length;
        var levelLogit = LevelModel.PerLevel * (meanLevel - opponentLevel)
            - LevelModel.WeakestCard * (meanLevel - minLevel);
        var expectedWinRate = LevelModel.WinProbability(metaDeck.Confidence, levelLogit);
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
            var placementFit = slots is null ? 1.0 : CardVersionRules.PlacementFit(slots, meta.CardVersions, cardMap);
            return new BuilderScore(
                score.Value * placementFit,
                meta.Confidence,
                fieldability.Value,
                IsMeta: true,
                meta.Players ?? 0);
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

        var versions = CardVersionRules.WithChampionVersions(deck.CardIds, deck.CardVersions, cardMap);
        var metaVersions = CardVersionRules.CapEvolutions(versions);
        var personalized = CardVersionRules.UpgradeIntoFreeSlots(
            CardVersionRules.CapEvolutions(CardVersionRules.PersonalizeVersions(versions, cardMap)), metaVersions, cardMap);

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

    public WarDeckResult FindBestWarDecks(
        IReadOnlyList<DeckMeta> metaDecks,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        LineupOptions? options = null,
        CancellationToken ct = default)
    {
        options ??= LineupOptions.Default;
        ct.ThrowIfCancellationRequested();
        var opponent = LevelModel.OpponentLevel(cardMap.Values);
        var locked = ScoreLockedDecks(metaDecks, cardMap, options.LockedDecks, opponent);
        var lockedCards = locked.SelectMany(l => l.deck.CardIds).ToHashSet();

        var candidates = ScoreFieldableDecks(metaDecks, cardMap, opponent)
            .Where(c => IsAllowed(c.deck, cardMap, options, lockedCards))
            .ToList();
        var required = options.RequiredCards.Where(id => !lockedCards.Contains(id)).ToHashSet();

        return SelectLineup(candidates, cardMap, includeAlternatives: true,
            deckCount: options.DeckCount - locked.Count, requiredCards: required, locked: locked, ct: ct);
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

        return ScoreLockedDecks(byKey, cardMap, lockedDecks, opponentLevel);
    }

    /// <summary>Scores only the supplied decks, with the same versions and unproven-deck fallback as generator locks.</summary>
    public IReadOnlyList<ScoredDeck> ScoreLockedDecks(
        IReadOnlyDictionary<string, DeckMeta> metaIndex,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        IReadOnlyList<int[]> lockedDecks)
        => ScoreLockedDecks(metaIndex, cardMap, [.. lockedDecks.Select(ids => ids.Order().ToArray())],
                LevelModel.OpponentLevel(cardMap.Values))
            .Select(d => ToScoredDeck(d.deck, d.score, cardMap))
            .ToList();

    private List<(DeckMeta deck, double score)> ScoreLockedDecks(
        IReadOnlyDictionary<string, DeckMeta> byKey,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        IReadOnlyList<int[]> lockedDecks,
        double opponentLevel)
    {
        var locked = new List<(DeckMeta deck, double score)>(lockedDecks.Count);
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

            var estimate = ScoreBuilderDeck(cardMap, ids, meta: null)
                ?? throw new InvalidOperationException("A locked deck whose cards are all owned always has a builder score");
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
        if (byScore != 0)
        {
            return byScore;
        }
        return (y.deck.Players ?? 0).CompareTo(x.deck.Players ?? 0);
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
        IReadOnlyList<(DeckMeta deck, double score)>? locked = null,
        CancellationToken ct = default)
    {
        var sorted = assumeSorted ? fieldable : SortCandidates(fieldable);
        var required = requiredCards ?? new HashSet<int>();

        var lineup = new List<(DeckMeta deck, double score)>();
        var lastPoolCount = -1;
        var poolMinPlayers = PopularityGateLadder[0];
        foreach (var gate in PopularityGateLadder)
        {
            var pool = sorted.Where(s => s.deck.Players is null || s.deck.Players >= gate).ToList();
            if (pool.Count == lastPoolCount)
            {
                continue;
            }
            lastPoolCount = pool.Count;
            poolMinPlayers = gate;
            ct.ThrowIfCancellationRequested();
            lineup = LineupSearch.FindOptimalLineup(pool, deckCount, required, ct);
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
            PoolMinPlayers = poolMinPlayers,
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
