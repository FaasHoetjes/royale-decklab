import { CardVersion, DeckMeta, PlayerItemLevel, Rarity, ScoredDeck, WarDeckResult } from '../models/models';

export default class DeckAnalyzer {
    // In-game evolution slots: slot 1 takes an Evo, slot 2 a Hero, slot 3 either.
    // So a legal deck has at most 2 Evos, at most 2 Heroes, and at most 3 specials
    // overall. Correct meta data already respects this; the cap below is only a
    // safety net against a malformed deck slipping through.
    private static readonly MAX_EVO = 2;
    private static readonly MAX_HERO = 2;
    private static readonly MAX_SPECIALS = 3;

    // Clash Royale card stats compound ~10% per level (verified against live card
    // data: each level is ~x1.10, so level 11 is ~2.59x level 1). A card N levels
    // below its max therefore fields 1.10^-N of full combat stats. We use this to
    // turn a level deficit into the fraction of a deck's strength the player can
    // actually field. The meta win rates are measured at tournament-normalised
    // (maxed) levels, so "maxed" is the reference point we compare against.
    private static readonly STAT_GROWTH_PER_LEVEL = 1.10;

    // How harshly to down-rank a deck the player can't field at full strength.
    // This is the one scoring knob we can't learn from data: Path of Legend
    // battles are level-normalised (every card at its rarity max), so the sample
    // has no level variance to fit against. A head-to-head backtest on that data
    // also showed deck-strength differences barely predict individual wins
    // (~52% even at large gaps), which makes the level deficit the main lever we
    // actually control — so its shape is grounded in real mechanics (above) and
    // this single sensitivity exponent is the tunable. 1.0 = score scales
    // directly with the deck's average combat-stat fraction; >1 punishes
    // under-levelled decks harder, <1 is more forgiving.
    private static readonly LEVEL_SENSITIVITY = 1.0;

    // How much of a deck's measured strength we assume is lost per special version
    // (Evolution or Hero) the meta deck fielded that the player hasn't unlocked.
    // The win rates are measured WITH those specials on the field, and an evolution
    // is a power spike the deck is built around — not just one slightly-stronger
    // card — so this is a deck-level multiplier, not a per-card average that would
    // dilute a real handicap to ~1% of the score. It compounds: missing one ≈ 6%
    // weaker, two ≈ 12%, three ≈ 17% — a rule-of-thumb range for how much an evo
    // is worth. Like LEVEL_SENSITIVITY this is a hand-set knob: the meta sample is
    // version-rich but has no "same deck without the evo" counterfactual to fit to.
    private static readonly MISSING_SPECIAL_MULTIPLIER = 0.94;

    // Minimum distinct top players who must have run a deck for us to recommend
    // it. Popularity is a representativeness GATE, not a win-rate multiplier: a
    // head-to-head backtest showed how many players run a deck doesn't predict
    // who wins a battle (it sat at or below a coin flip). What it does capture is
    // whether a deck is genuinely meta versus one person's pet deck. The floor is
    // set above the long tail of low-adoption decks; because we now record both
    // sides of every sampled battle the per-deck player counts are roughly double
    // what they were, so a stricter floor than the original 3 is well supported.
    // The gate only ever relaxes downward (see the ladder), so raising the floor
    // costs thin collections nothing — they fall through to a looser level.
    private static readonly MIN_DISTINCT_PLAYERS = 5;

    // Popularity also re-enters the score as a soft weight (above the gate). The
    // gate alone wasn't enough: a deck just over the floor (5 players) can post a
    // high Wilson bound on a lucky sample and top the list over a staple dozens of
    // players field — which reads to the user as "why is my #1 deck used by 5
    // people?". This weight pulls broadly-adopted decks up without letting
    // popularity dominate win rate: players/(players + prior), rising with player
    // count and saturating — same shape as the meta-cache popularityWeight, but
    // with its own prior so tuning it here leaves that ordering untouched. Higher
    // prior = more weight on adoption (8: 5→0.38, 20→0.71, 50→0.86, 100→0.93).
    // Caches predating player counts skip it (factor 1), same as the gate.
    private static readonly POPULARITY_PRIOR = 8;

    /**
     * Champions (Mighty Miner, Golden Knight, Archer Queen, …) are a card rarity,
     * not an evolution: they're always fielded in the champion ("hero") slot and
     * have no normal version. The battlelog's evolutionLevel never flags them, so
     * card identity (rarity) is the only reliable signal. The player's own card
     * data carries this rarity, and any deck we score is one the player can field,
     * so the champion is always present in the map here.
     */
    private isChampion(cardId: number, cardMap: Map<number, PlayerItemLevel>): boolean {
        return cardMap.get(cardId)?.rarity === Rarity.CHAMPION;
    }

    /**
     * Adds champions to a meta deck's stored versions. Two kinds of card belong in
     * the champion ("hero") slot: a card fielded as its hero version, which the
     * battlelog flags via evolutionLevel >= 2 and the stored data already records
     * as 'hero'; and a champion (e.g. Mighty Miner), which the battlelog CAN'T flag
     * (champions carry no evolutionLevel), so we force it here by identity. Every
     * other card keeps its stored version. Builds one entry per deck card so the
     * result is complete and ordered by the deck's own card list.
     */
    private withChampionVersions(
        cardIds: number[],
        cardVersions: CardVersion[] | undefined,
        cardMap: Map<number, PlayerItemLevel>
    ): CardVersion[] {
        const rawVersion = new Map((cardVersions ?? []).map(v => [v.cardId, v.version] as const));
        return cardIds.map(cardId => {
            const version: CardVersion['version'] =
                this.isChampion(cardId, cardMap) ? 'hero' : (rawVersion.get(cardId) ?? 'normal');
            return { cardId, version };
        });
    }

    private popularityFactor(players: number | undefined): number {
        if (players === undefined) {
            return 1;
        }
        if (players <= 0) {
            return 0;
        }
        return players / (players + DeckAnalyzer.POPULARITY_PRIOR);
    }

    // The gate is adaptive, not fixed. We use the strictest level that still
    // fills all four deck slots and fall through to a looser one only when the
    // player can't field four disjoint decks from the stricter pool — typically a
    // thin collection, where a slightly-less-proven deck beats an empty result.
    // Strictest first; the last step (1) admits even one-off decks as a last
    // resort. Decks from caches predating player counts skip the gate entirely.
    private static readonly POPULARITY_GATE_LADDER = [DeckAnalyzer.MIN_DISTINCT_PLAYERS, 3, 2, 1];

    /**
     * Enforces the legal evolution-slot limits on a deck's meta versions,
     * downgrading any special beyond the limits back to 'normal'. Specials are
     * kept in array order, so the first legal ones a deck lists win. Returns the
     * original array untouched when it's already legal, so the shared meta cache
     * is never mutated.
     */
    private capEvolutions(cardVersions: CardVersion[] | undefined): CardVersion[] | undefined {
        if (!cardVersions) {
            return cardVersions;
        }
        let evo = 0, hero = 0, total = 0;
        let illegal = false;
        const capped = cardVersions.map(v => {
            if (v.version === 'normal') {
                return v;
            }
            const fitsType = v.version === 'evo' ? evo < DeckAnalyzer.MAX_EVO : hero < DeckAnalyzer.MAX_HERO;
            if (fitsType && total < DeckAnalyzer.MAX_SPECIALS) {
                if (v.version === 'evo') { evo++; } else { hero++; }
                total++;
                return v;
            }
            illegal = true;
            return { cardId: v.cardId, version: 'normal' as const };
        });
        return illegal ? capped : cardVersions;
    }

    /**
     * Resolves a meta deck's special versions down to what THIS player can actually
     * field for display: an evo/hero version the player hasn't unlocked is shown as
     * the normal card, because that's the version they'd play. This is purely
     * cosmetic — scoring still uses the real meta versions (and penalises missing
     * ones in scoreDecksForPlayer). Champions are never downgraded: owning the card
     * (a precondition of the deck being fieldable) means owning the champion, and
     * they have no normal version. For evo/hero versions, ownership comes from
     * evolutionLevel: >= 1 owns the evo tier, >= 2 owns the hero tier, matching how
     * meta versions are detected from battle logs. Returns the original array
     * untouched when nothing changes, so the shared meta cache is never mutated.
     */
    private personalizeVersions(
        cardVersions: CardVersion[] | undefined,
        cardMap: Map<number, PlayerItemLevel>
    ): CardVersion[] | undefined {
        if (!cardVersions) {
            return cardVersions;
        }
        let changed = false;
        const personalized = cardVersions.map(v => {
            if (v.version === 'normal' || this.isChampion(v.cardId, cardMap)) {
                return v;
            }
            const owned = cardMap.get(v.cardId)?.evolutionLevel ?? 0;
            const ownsVersion = v.version === 'hero' ? owned >= 2 : owned >= 1;
            if (ownsVersion) {
                return v;
            }
            changed = true;
            return { cardId: v.cardId, version: 'normal' as const };
        });
        return changed ? personalized : cardVersions;
    }

    scoreDecksForPlayer(
        playerCards: PlayerItemLevel[],
        metaDeck: DeckMeta,
        cardVersions?: Array<{ cardId: number; version: 'normal' | 'evo' | 'hero' }>
    ): number | null {
        const cardMap = new Map<number, PlayerItemLevel>();
        for (const card of playerCards) {
            cardMap.set(card.id, card);
        }

        let totalStatFraction = 0;
        // Version fit compounds across the deck (a product), so each missing special
        // takes a real bite out of the whole score rather than 1/8 of one card's.
        let versionFit = 1.0;
        let validCards = 0;

        for (const cardId of metaDeck.cardIds) {
            const playerCard = cardMap.get(cardId);
            if (!playerCard) {
                return null;
            }

            // Fraction of full combat stats this card fields, from Clash Royale's
            // ~10%-per-level curve: each level below the card's max costs ~10%.
            // Rarity-fair (one level down is ~10% for every rarity), unlike a raw
            // level/maxLevel ratio whose scale shifts with the rarity's max number.
            const levelsBelowMax = Math.max(0, playerCard.maxLevel - playerCard.level);
            const statFraction = Math.pow(DeckAnalyzer.STAT_GROWTH_PER_LEVEL, -levelsBelowMax);
            totalStatFraction += statFraction;
            validCards++;

            // Penalty if the meta deck fielded a special version the player hasn't
            // unlocked: a hero version needs evolutionLevel >= 2, an evolution >= 1
            // (matching how meta versions are detected from battle logs). Champions
            // are exempt — there's no tier to unlock, and owning the card is a
            // precondition of fielding the deck at all. Only specials the deck
            // actually fields count: a card recorded as 'normal' here never penalises,
            // even if an Evolution exists for it (see MISSING_SPECIAL_MULTIPLIER).
            if (cardVersions && !this.isChampion(cardId, cardMap)) {
                const metaCardVersion = cardVersions.find(c => c.cardId === cardId);
                if (metaCardVersion) {
                    const playerEvoLevel = playerCard.evolutionLevel ?? 0;
                    const missingHero = metaCardVersion.version === 'hero' && playerEvoLevel < 2;
                    const missingEvo = metaCardVersion.version === 'evo' && playerEvoLevel < 1;
                    if (missingHero || missingEvo) {
                        versionFit *= DeckAnalyzer.MISSING_SPECIAL_MULTIPLIER;
                    }
                }
            }
        }

        const avgStatFraction = totalStatFraction / validCards;
        // Score off the confidence-adjusted win rate so small-sample decks don't
        // outrank well-tested ones. Fall back to the raw rate for caches built
        // before confidence was stored.
        const metaStrength = metaDeck.confidence ?? metaDeck.winRate;
        // Down-rank decks the player can't field at full strength, grounded in the
        // game's per-level stat curve (see STAT_GROWTH_PER_LEVEL / LEVEL_SENSITIVITY).
        const levelWeight = Math.pow(avgStatFraction, DeckAnalyzer.LEVEL_SENSITIVITY);
        // Popularity acts at two levels: a hard gate (applied at the top) plus this
        // soft weight. It doesn't predict who wins a single battle, but it captures
        // whether a deck is genuinely meta versus one squad's pet deck — so it nudges
        // proven, broadly-fielded decks above niche high-variance ones rather than
        // scaling raw win rate. Decks rank on strength × fieldability × adoption.
        const playerScore =
            metaStrength * levelWeight * versionFit * this.popularityFactor(metaDeck.players);

        return playerScore;
    }

    /**
     * The player-controllable strength of an ARBITRARY deck — the `levelWeight`
     * term of the full player score on its own. It's the average fraction of full
     * combat stats the player fields across the deck, from the same ~10%-per-level
     * curve used in scoreDecksForPlayer (see STAT_GROWTH_PER_LEVEL). Used by the
     * War Deck Builder for decks that aren't in the meta: with no measured win rate
     * or popularity for a hand-built deck, fieldability is the honest signal we can
     * give ("how close to maxed can you run this?"). There's no version penalty
     * either — the builder fields exactly the evo/hero art the player owns, so
     * there's no meta version to fall short of. Returns null if any card isn't in
     * the player's collection. Kept deliberately consistent with the levelWeight
     * computed in scoreDecksForPlayer so a deck's fieldability and its meta score
     * agree on the level term.
     */
    fieldabilityScore(playerCards: PlayerItemLevel[], cardIds: number[]): number | null {
        const cardMap = new Map<number, PlayerItemLevel>();
        for (const card of playerCards) {
            cardMap.set(card.id, card);
        }

        let totalStatFraction = 0;
        let validCards = 0;
        for (const cardId of cardIds) {
            const playerCard = cardMap.get(cardId);
            if (!playerCard) {
                return null;
            }
            const levelsBelowMax = Math.max(0, playerCard.maxLevel - playerCard.level);
            totalStatFraction += Math.pow(DeckAnalyzer.STAT_GROWTH_PER_LEVEL, -levelsBelowMax);
            validCards++;
        }
        if (validCards === 0) {
            return null;
        }
        const avgStatFraction = totalStatFraction / validCards;
        return Math.pow(avgStatFraction, DeckAnalyzer.LEVEL_SENSITIVITY);
    }

    // The prior win rate assumed for a deck we have no meta data on. A deck the
    // player invents has zero observed games, so the honest expectation is the
    // population baseline: in 1v1 war/ladder every battle has one winner and one
    // loser, so an arbitrary deck is a coin flip until evidence says otherwise.
    // This keeps a custom deck's score on the SAME scale as a meta deck's (both
    // are winRate × fieldability) instead of the two living in different ranges.
    private static readonly NEUTRAL_WIN_RATE = 0.5;

    /**
     * Scores a single War Deck Builder deck on the SAME scale as the auto-generated
     * recommendations, so a hand-built deck and a recommended deck are directly
     * comparable.
     *
     *  - A deck that IS a known meta deck is scored by delegating to
     *    scoreDecksForPlayer — the identical formula the generator uses
     *    (metaStrength × levelWeight × avgVersionMultiplier × popularityFactor).
     *    Rebuilding a recommended deck by hand therefore shows its exact recommended
     *    score, and a hand-built meta deck can never outrank the optimized set on a
     *    scale mismatch (the bug this fixes: the builder used to omit popularityFactor
     *    and so inflated every meta deck above its real score).
     *  - A deck that ISN'T in the meta is unproven: no measured win rate, and nobody
     *    on record fielding it. It gets the neutral coin-flip win rate (NEUTRAL_WIN_RATE)
     *    and the popularity treatment of a deck played by a single person —
     *    popularityFactor(1), since the only player we know runs it is the user. That
     *    keeps it strictly below every recommendable meta deck (whose popularity gate
     *    floor is MIN_DISTINCT_PLAYERS) while fieldability still orders one invented
     *    deck against another. Same winRate × fieldability × popularity shape as the
     *    meta path, just with prior values in place of measured ones.
     *
     * Returns null when the deck can't be scored (empty, or a card missing from the
     * player's collection).
     */
    scoreBuilderDeck(
        playerCards: PlayerItemLevel[],
        cardIds: number[],
        meta?: DeckMeta
    ): { score: number; winRate: number; fieldability: number; isMeta: boolean; players: number } | null {
        const fieldability = this.fieldabilityScore(playerCards, cardIds);
        if (fieldability === null) {
            return null;
        }
        if (meta) {
            const score = this.scoreDecksForPlayer(playerCards, meta, meta.cardVersions);
            if (score === null) {
                return null;
            }
            return {
                score,
                winRate: meta.confidence ?? meta.winRate,
                fieldability,
                isMeta: true,
                players: meta.players ?? 0,
            };
        }
        const score = DeckAnalyzer.NEUTRAL_WIN_RATE * fieldability * this.popularityFactor(1);
        return {
            score,
            winRate: DeckAnalyzer.NEUTRAL_WIN_RATE,
            fieldability,
            isMeta: false,
            players: 0,
        };
    }

    // How many extra decks beyond the primary four to return as swap candidates.
    // The UI offers up to a few valid alternatives per slot after filtering out
    // decks that clash with the three decks being kept; meta decks share a lot of
    // cards, so most of this pool gets filtered out per slot — hence a generous
    // size, so enough survive the per-slot disjointness filter to be useful.
    private static readonly ALTERNATIVE_POOL_SIZE = 60;

    /** Build the player-facing ScoredDeck view of a meta deck. */
    private toScoredDeck(
        deck: DeckMeta,
        score: number,
        cardIdToCard: Map<number, PlayerItemLevel>
    ): ScoredDeck {
        const cards = deck.cardIds
            .map(id => cardIdToCard.get(id))
            .filter((card): card is PlayerItemLevel => card !== undefined);

        // Stored versions can't flag champions (the battlelog never does), so
        // reconcile them with the champion rule before splitting into the meta
        // (slot-driving) and personalised (art-driving) views.
        const versions = this.withChampionVersions(deck.cardIds, deck.cardVersions, cardIdToCard);

        return {
            cardIds: deck.cardIds,
            metaWinRate: deck.winRate,
            confidence: deck.confidence ?? deck.winRate,
            uses: deck.uses,
            players: deck.players ?? 0,
            pickRate: deck.pickRate ?? 0,
            playerScore: score,
            cards,
            cardVersions: this.capEvolutions(this.personalizeVersions(versions, cardIdToCard)),
            metaCardVersions: this.capEvolutions(versions)
        };
    }

    /**
     * Greedily appends up to four mutually card-disjoint decks from a list
     * already sorted best-first — the war rule that no card is fielded twice
     * across the kept decks. Mutates the running selection state so it can be
     * called repeatedly with progressively looser pools: decks whose cards are
     * already taken (including ones picked on an earlier call) simply conflict
     * and are skipped, so proven picks are kept and only the remaining slots get
     * topped up. Stops once four decks are held.
     */
    private fillDisjointDecks(
        sortedDecks: Array<{ deck: DeckMeta; score: number }>,
        cardIdToCard: Map<number, PlayerItemLevel>,
        state: { selectedDecks: ScoredDeck[]; selected: Set<DeckMeta>; usedCardIds: Set<number> }
    ): void {
        for (const { deck, score } of sortedDecks) {
            if (state.selectedDecks.length >= 4) {
                break;
            }
            const hasConflict = deck.cardIds.some(id => state.usedCardIds.has(id));
            if (hasConflict) {
                continue;
            }
            deck.cardIds.forEach(id => state.usedCardIds.add(id));
            state.selected.add(deck);
            state.selectedDecks.push(this.toScoredDeck(deck, score, cardIdToCard));
        }
    }

    findBestWarDecks(
        playerCards: PlayerItemLevel[],
        metaDecks: DeckMeta[],
        cardIdToCard: Map<number, PlayerItemLevel>
    ): WarDeckResult {
        // Score every deck the player can actually field (null = missing a card).
        // The popularity gate is applied afterwards, adaptively.
        const fieldable: Array<{ deck: DeckMeta; score: number }> = [];
        for (const metaDeck of metaDecks) {
            const score = this.scoreDecksForPlayer(playerCards, metaDeck, metaDeck.cardVersions);
            if (score !== null) {
                fieldable.push({ deck: metaDeck, score });
            }
        }

        // Fill the four slots from the strictest popularity gate first, relaxing
        // one step at a time only for the slots still open (see
        // POPULARITY_GATE_LADDER). The selection state carries across gates, so a
        // proven deck picked at gate 5 is kept and a looser gate is consulted only
        // to top up the remaining slots — never to replace a stricter pick. This
        // matters because meta decks share staple cards, so even a rich pool can
        // fall a deck or two short of four card-disjoint decks at the strict gate.
        const state = { selectedDecks: [] as ScoredDeck[], selected: new Set<DeckMeta>(), usedCardIds: new Set<number>() };
        for (const gate of DeckAnalyzer.POPULARITY_GATE_LADDER) {
            const eligible = fieldable.filter(s => s.deck.players === undefined || s.deck.players >= gate);
            // Strength first; popularity only breaks exact ties now — its demoted
            // role (prefer the more established deck when scores are identical).
            eligible.sort((a, b) =>
                b.score !== a.score ? b.score - a.score : (b.deck.players ?? 0) - (a.deck.players ?? 0)
            );
            this.fillDisjointDecks(eligible, cardIdToCard, state);
            if (state.selectedDecks.length >= 4) {
                break; // all four slots filled; no need to relax further
            }
            // Otherwise relax to the next gate to fill the remaining slots; the
            // loosest step is our best effort.
        }
        const selectedDecks = state.selectedDecks;
        const selected = state.selected;

        // The swap pool: the next best-scoring decks that weren't chosen as one of
        // the four. Drawn from the FULL fieldable set (every gate), not just the
        // gate the selection settled on — the settled gate is often the strictest,
        // most staple-heavy slice, whose decks collide most with the kept four and
        // so survive the UI's per-slot disjointness filter the worst. Pulling from
        // all gates gives the picker more archetype diversity to offer. Unlike the
        // four, these may overlap each other and the primaries — the UI enforces
        // card-disjointness against the three kept decks when a swap happens.
        const altPool = [...fieldable].sort((a, b) =>
            b.score !== a.score ? b.score - a.score : (b.deck.players ?? 0) - (a.deck.players ?? 0)
        );
        const alternatives: ScoredDeck[] = [];
        for (const { deck, score } of altPool) {
            if (alternatives.length >= DeckAnalyzer.ALTERNATIVE_POOL_SIZE) {
                break;
            }
            if (selected.has(deck)) {
                continue;
            }
            alternatives.push(this.toScoredDeck(deck, score, cardIdToCard));
        }

        const totalScore = selectedDecks.reduce((sum, deck) => sum + deck.playerScore, 0);

        return {
            decks: selectedDecks,
            totalScore,
            alternatives
        };
    }
}
