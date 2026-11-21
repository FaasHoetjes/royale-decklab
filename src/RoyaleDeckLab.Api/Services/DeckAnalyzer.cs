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
    private const int AlternativesPerSlot = 15;

    private static readonly int[] PopularityGateLadder = [MinDistinctPlayers, 3, 2, 1];

    private const int DecksPerLineup = 4;

    /// <param name="IsMeta">A meta deck played with the meta's specials in place.</param>
    /// <param name="MetaCards">The cards of a meta deck, whatever their setup.</param>
    public sealed record BuilderScore(double Score, double WinRate, double Fieldability, bool IsMeta, int Players, bool MetaCards);

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
        double opponentLevel,
        bool creditSubstitutes = true)
    {
        if (DeckLevels(cardMap, metaDeck.CardIds) is not var (meanLevel, minLevel))
        {
            return null;
        }

        var (missing, metaSpecials, champions, evoOnly, heroOnly, either) = (0, 0, 0, 0, 0, 0);
        foreach (var cardId in metaDeck.CardIds)
        {
            var playerCard = cardMap[cardId];
            if (playerCard.Rarity == Rarity.Champion)
            {
                champions++;
                continue;
            }
            var owned = playerCard.EvolutionLevel;
            if (cardVersions is not null)
            {
                for (var v = 0; v < cardVersions.Count; v++)
                {
                    if (cardVersions[v].CardId == cardId)
                    {
                        var meta = cardVersions[v].Version;
                        metaSpecials += meta == CardVersionKind.Normal ? 0 : 1;
                        missing += meta != CardVersionKind.Normal && !EvolutionBits.Owns(owned, meta) ? 1 : 0;
                        break;
                    }
                }
            }
            (evoOnly, heroOnly, either) = (EvolutionBits.OwnsEvo(owned), EvolutionBits.OwnsHero(owned)) switch
            {
                (true, true) => (evoOnly, heroOnly, either + 1),
                (true, false) => (evoOnly + 1, heroOnly, either),
                (false, true) => (evoOnly, heroOnly + 1, either),
                _ => (evoOnly, heroOnly, either),
            };
        }
        if (missing > 0 && creditSubstitutes)
        {
            // War battles where a deck swaps one special for another win as often as the usual setup (11k battles),
            // so only the special slots the player's own can't fill cost anything.
            var fielded = CardVersionRules.FreeSlotsFilled(0, champions, evoOnly, heroOnly, either);
            missing = Math.Min(missing, Math.Max(0, metaSpecials - fielded));
        }
        var versionFit = Math.Pow(CardVersionRules.MissingSpecialMultiplier, missing);

        var levelLogit = LevelFit.War.Logit(meanLevel, minLevel, opponentLevel);
        var expectedWinRate = LevelModel.WinProbability(metaDeck.Confidence, levelLogit);
        return expectedWinRate * versionFit;
    }

    /// <returns>Null when the player is missing one of the cards.</returns>
    private static (double Mean, int Weakest)? DeckLevels(IReadOnlyDictionary<int, PlayerItemLevel> cardMap, int[] cardIds)
    {
        if (cardIds.Length == 0)
        {
            throw new InvalidOperationException("Sequence contains no elements");
        }

        long totalLevel = 0;
        var minLevel = int.MaxValue;
        foreach (var cardId in cardIds)
        {
            if (!cardMap.TryGetValue(cardId, out var card))
            {
                return null;
            }
            var level = LevelModel.DisplayLevel(card);
            totalLevel += level;
            minLevel = Math.Min(minLevel, level);
        }
        return ((double)totalLevel / cardIds.Length, minLevel);
    }

    /// <param name="extraMissing">Log-odds the player gives up by fielding fewer specials than they could.</param>
    private static double? ScoreDuelDeck(
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        DeckMeta deck,
        double opponentLevel,
        DuelValues values,
        double extraMissing = 0)
    {
        if (DeckLevels(cardMap, deck.CardIds) is not var (meanLevel, minLevel))
        {
            return null;
        }
        var levelLogit = values.Levels.Logit(meanLevel, minLevel, opponentLevel);
        var missing = CardVersionRules.MissingSpecialValue(deck.CardIds, deck.CardVersions, cardMap, values.Specials);
        return LevelModel.WinProbability(deck.Confidence, levelLogit - missing - extraMissing);
    }

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

    /// <param name="opponentLevel">Defaults to the opponents the player's own levels predict.</param>
    public BuilderScore? ScoreBuilderDeck(
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        IReadOnlyList<int> cardIds,
        DeckMeta? meta,
        IReadOnlyList<int?>? slots = null,
        double? opponentLevel = null)
    {
        var opponent = opponentLevel ?? LevelModel.OpponentLevel(cardMap.Values);
        var fieldability = FieldabilityScore(cardMap, cardIds);
        if (fieldability is null)
        {
            return null;
        }

        if (meta is not null)
        {
            // Where the player has placed the cards, only the slots say which specials stand in for missing ones.
            var score = ScoreDeckForPlayer(cardMap, meta, meta.CardVersions, opponent, creditSubstitutes: slots is null);
            if (score is null)
            {
                return null;
            }
            var placement = slots is null
                ? new CardVersionRules.Placement(1, AsMeta: true)
                : CardVersionRules.PlacementFit(slots, meta.CardVersions, cardMap);
            return new BuilderScore(
                score.Value * placement.Fit,
                meta.Confidence,
                fieldability.Value,
                IsMeta: placement.AsMeta,
                meta.Players ?? 0,
                MetaCards: true);
        }

        var levels = cardIds.Select(id => LevelModel.DisplayLevel(cardMap[id])).ToList();
        var levelLogit = LevelModel.LevelLogit(levels, opponent);
        var neutral = LevelModel.WinProbability(NeutralWinRate, levelLogit) * UnprovenDeckDampener;
        return new BuilderScore(neutral, NeutralWinRate, fieldability.Value, IsMeta: false, Players: 0, MetaCards: false);
    }

    /// <summary>
    /// The versions the deck's players use; the ones of those this player owns; and those plus the player's other
    /// specials in the slots still free, which is how the player fields the deck.
    /// </summary>
    private static (IReadOnlyList<CardVersion> Meta, IReadOnlyList<CardVersion> Owned, IReadOnlyList<CardVersion> Player) PlayerVersions(
        DeckMeta deck, IReadOnlyDictionary<int, PlayerItemLevel> cardMap, SpecialValues? values = null)
    {
        var versions = CardVersionRules.WithChampionVersions(deck.CardIds, deck.CardVersions, cardMap);
        var metaVersions = CardVersionRules.CapEvolutions(versions)!;
        var owned = CardVersionRules.CapEvolutions(CardVersionRules.PersonalizeVersions(versions, cardMap))!;
        return (metaVersions, owned, CardVersionRules.UpgradeIntoFreeSlots(owned, cardMap, deck, values)!);
    }

    private static ScoredDeck ToScoredDeck(
        DeckMeta deck,
        double score,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        IReadOnlyDictionary<int, CardVersionKind>? forcedVersions = null,
        SpecialValues? values = null)
    {
        var cards = new List<PlayerItemLevel>(deck.CardIds.Length);
        foreach (var id in deck.CardIds)
        {
            if (cardMap.TryGetValue(id, out var card))
            {
                cards.Add(card);
            }
        }

        var (metaVersions, owned, personalized) = PlayerVersions(deck, cardMap, values);
        if (forcedVersions is { Count: > 0 } && deck.CardIds.Any(forcedVersions.ContainsKey))
        {
            personalized = CardVersionRules.PlayAsAsked(owned, forcedVersions, cardMap, deck, values);
        }

        return new ScoredDeck
        {
            CardIds = deck.CardIds,
            MetaWinRate = deck.WinRate,
            Confidence = deck.Confidence,
            Uses = deck.Uses,
            LeagueUses = deck.LeagueUses,
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

        var forced = ForcedVersions(options, lockedCards);
        // The war score counts the specials the player fields; only fewer of them played costs anything, since
        // swapping one special for another wins as often.
        var candidates = WithForcedVersions(
            ScoreFieldableDecks(metaDecks, cardMap, opponent).Where(c => IsAllowed(c.deck, cardMap, options, lockedCards)),
            forced,
            cardMap,
            null,
            (candidate, versions, asked) =>
            {
                var meta = Specials(versions.Meta, cardMap);
                int Unfilled(IReadOnlyList<CardVersion> played) => Math.Max(0, meta - Specials(played, cardMap));
                return candidate.score * Math.Pow(CardVersionRules.MissingSpecialMultiplier, Unfilled(asked) - Unfilled(versions.Player));
            });
        var required = options.RequiredCards.Where(id => !lockedCards.Contains(id)).ToHashSet();

        return SelectLineup(candidates, cardMap, includeAlternatives: true,
            deckCount: options.DeckCount - locked.Count, requiredCards: required, locked: locked,
            forcedVersions: forced, ct: ct);
    }

    /// <summary>The best Duel Deck from the Crown Series meta, with every card at the level the league lets it play at.</summary>
    public WarDeckResult FindBestCrownSeriesDecks(
        IReadOnlyList<DeckMeta> duelMeta,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        CrownSeriesLeague league,
        LineupOptions options,
        DuelValues values,
        CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        var capped = league.CapLevels(cardMap);
        var opponent = CrownSeriesLevels.OpponentLevel(capped.Values, league);
        var locked = ScoreLockedDuelDecks(duelMeta, capped, options.LockedDecks, opponent, values);
        var lockedCards = locked.SelectMany(l => l.deck.CardIds).ToHashSet();

        var scored = new List<(DeckMeta deck, double score)>();
        foreach (var deck in duelMeta)
        {
            if (IsAllowed(deck, capped, options, lockedCards) && ScoreDuelDeck(capped, deck, opponent, values) is { } score)
            {
                scored.Add((deck, score));
            }
        }
        var forced = ForcedVersions(options, lockedCards);
        var candidates = WithForcedVersions(scored, forced, capped, values.Specials, (candidate, versions, asked) =>
            ScoreDuelDeck(capped, candidate.deck, opponent, values, extraMissing: Math.Max(0,
                SpecialValue(versions.Player, capped, values.Specials) - SpecialValue(asked, capped, values.Specials))));
        var required = options.RequiredCards.Where(id => !lockedCards.Contains(id)).ToHashSet();

        return SelectLineup(candidates, capped, includeAlternatives: true,
            deckCount: options.DeckCount - locked.Count, requiredCards: required, locked: locked,
            forcedVersions: forced, specialValues: values.Specials, ct: ct);
    }

    private static DeckMeta? FindDeck(IReadOnlyList<DeckMeta> meta, int[] cardIds)
    {
        int[] sorted = [.. cardIds.Order()];
        for (var i = 0; i < meta.Count; i++)
        {
            if (meta[i].CardIds.AsSpan().SequenceEqual(sorted))
            {
                return meta[i];
            }
        }
        return null;
    }

    // A locked deck that has left the Duel meta since is kept at an even win rate before levels; one with a card the
    // player doesn't own can't be fielded and is skipped.
    private static List<(DeckMeta deck, double score)> ScoreLockedDuelDecks(
        IReadOnlyList<DeckMeta> duelMeta,
        IReadOnlyDictionary<int, PlayerItemLevel> capped,
        IReadOnlyList<int[]> lockedDecks,
        double opponentLevel,
        DuelValues values)
    {
        var locked = new List<(DeckMeta deck, double score)>(lockedDecks.Count);
        if (lockedDecks.Count == 0)
        {
            return locked;
        }
        foreach (var ids in lockedDecks)
        {
            var deck = FindDeck(duelMeta, ids) ?? new DeckMeta
            {
                CardIds = ids,
                WinRate = CrownSeriesMeta.DuelPriorWinRate,
                Confidence = CrownSeriesMeta.DuelPriorWinRate,
                Uses = 0,
                Players = 0,
            };
            if (ScoreDuelDeck(capped, deck, opponentLevel, values) is { } score)
            {
                locked.Add((deck, score));
            }
        }
        return locked;
    }

    // A locked deck is kept as it was locked, so a version asked for one of its cards doesn't apply.
    private static Dictionary<int, CardVersionKind> ForcedVersions(LineupOptions options, HashSet<int> lockedCards)
        => options.RequiredVersions
            .Where(v => options.RequiredCards.Contains(v.Key) && !lockedCards.Contains(v.Key))
            .ToDictionary(v => v.Key, v => v.Value);

    /// <summary>
    /// Decks holding a card the player wants in a set version, rescored as played that way; a deck goes when the
    /// player hasn't unlocked that version. <paramref name="rescore"/> gets the deck's usual versions and the ones
    /// asked for.
    /// </summary>
    private static List<(DeckMeta deck, double score)> WithForcedVersions(
        IEnumerable<(DeckMeta deck, double score)> candidates,
        IReadOnlyDictionary<int, CardVersionKind> forced,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        SpecialValues? values,
        Func<(DeckMeta deck, double score), (IReadOnlyList<CardVersion> Meta, IReadOnlyList<CardVersion> Owned, IReadOnlyList<CardVersion> Player), IReadOnlyList<CardVersion>, double?> rescore)
    {
        if (forced.Count == 0)
        {
            return candidates.ToList();
        }
        var result = new List<(DeckMeta deck, double score)>();
        foreach (var candidate in candidates)
        {
            var asks = candidate.deck.CardIds.Where(forced.ContainsKey).ToList();
            if (asks.Count == 0)
            {
                result.Add(candidate);
                continue;
            }
            if (!asks.All(id => CardVersionRules.CanPlay(id, forced[id], cardMap)))
            {
                continue;
            }
            var versions = PlayerVersions(candidate.deck, cardMap, values);
            var asked = CardVersionRules.PlayAsAsked(versions.Owned, forced, cardMap, candidate.deck, values);
            if (CardVersionRules.FitsSlots(asked) && rescore(candidate, versions, asked) is { } score)
            {
                result.Add((candidate.deck, score));
            }
        }
        return result;
    }

    private static int Specials(IReadOnlyList<CardVersion> versions, IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        var (evos, heroes) = CardVersionRules.SpecialsPlayed(versions, cardMap);
        return evos + heroes;
    }

    private static double SpecialValue(
        IReadOnlyList<CardVersion> versions, IReadOnlyDictionary<int, PlayerItemLevel> cardMap, SpecialValues values)
    {
        var (evos, heroes) = CardVersionRules.SpecialsPlayed(versions, cardMap);
        return evos * values.Evo + heroes * values.Hero;
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
    /// For each deck in the lineup, the best decks that could take its place: ones that share no cards with the other
    /// decks. The best decks overall mostly share cards with several picked decks, so they'd fit no slot.
    /// </summary>
    private List<ScoredDeck> Alternatives(
        IReadOnlyList<(DeckMeta deck, double score)> sorted,
        IReadOnlyList<DeckMeta> lineup,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        IReadOnlyDictionary<int, CardVersionKind>? forcedVersions,
        SpecialValues? values)
    {
        var othersCards = lineup
            .Select((_, slot) => lineup.Where((_, other) => other != slot).SelectMany(d => d.CardIds).ToHashSet())
            .ToArray();
        var found = new int[lineup.Count];
        var alternatives = new List<ScoredDeck>();
        foreach (var (deck, score) in sorted)
        {
            if (found.All(n => n >= AlternativesPerSlot))
            {
                break;
            }
            if (lineup.Contains(deck))
            {
                continue;
            }
            var fits = false;
            for (var slot = 0; slot < lineup.Count; slot++)
            {
                if (found[slot] < AlternativesPerSlot && !deck.CardIds.Any(othersCards[slot].Contains))
                {
                    found[slot]++;
                    fits = true;
                }
            }
            if (fits)
            {
                alternatives.Add(ToScoredDeck(deck, score, cardMap, forcedVersions, values));
            }
        }
        return alternatives;
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
        IReadOnlyDictionary<int, CardVersionKind>? forcedVersions = null,
        SpecialValues? specialValues = null,
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

        var selectedDecks = new List<ScoredDeck>((locked?.Count ?? 0) + lineup.Count);
        foreach (var (deck, score) in (locked ?? []).Concat(lineup))
        {
            selectedDecks.Add(ToScoredDeck(deck, score, cardMap, forcedVersions, specialValues));
        }

        return new WarDeckResult
        {
            Decks = selectedDecks,
            TotalScore = selectedDecks.Sum(d => d.PlayerScore),
            Alternatives = includeAlternatives
                ? Alternatives(sorted, [.. (locked ?? []).Concat(lineup).Select(p => p.deck)], cardMap, forcedVersions, specialValues)
                : [],
            PoolMinPlayers = poolMinPlayers,
        };
    }
}
