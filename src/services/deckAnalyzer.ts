import { CardVersion, DeckMeta, PlayerItemLevel, ScoredDeck, WarDeckResult } from '../models/models';

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

    // Minimum distinct top players who must have run a deck for us to recommend
    // it. Popularity is a representativeness GATE, not a win-rate multiplier: a
    // head-to-head backtest showed how many players run a deck doesn't predict
    // who wins a battle (it sat at or below a coin flip). What it does capture is
    // whether a deck is genuinely meta versus one person's pet deck — and in the
    // live cache 71% of decks were run by a single player, 84% by fewer than
    // three. Below this floor a deck isn't established enough to suggest; at or
    // above it, popularity stops mattering and decks rank purely on strength and
    // how well the player can field them.
    private static readonly MIN_DISTINCT_PLAYERS = 3;

    // The gate is adaptive, not fixed. We use the strictest level that still
    // fills all four deck slots and fall through to a looser one only when the
    // player can't field four disjoint decks from the stricter pool — typically a
    // thin collection, where a slightly-less-proven deck beats an empty result.
    // Strictest first; the last step (1) admits even one-off decks as a last
    // resort. Decks from caches predating player counts skip the gate entirely.
    private static readonly POPULARITY_GATE_LADDER = [DeckAnalyzer.MIN_DISTINCT_PLAYERS, 2, 1];

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
     * Resolves a meta deck's special versions down to what THIS player can
     * actually field for display: any evo/hero the player hasn't unlocked is
     * shown as the normal card, because that's the version they'd play. This is
     * purely cosmetic — scoring still uses the real meta versions (and penalises
     * missing ones in scoreDecksForPlayer). Ownership comes from evolutionLevel:
     * >= 1 owns the evo tier, >= 2 owns the hero tier, matching how meta versions
     * are detected from battle logs. Returns the original array untouched when
     * the player owns every special, so the shared meta cache is never mutated.
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
            if (v.version === 'normal') {
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
        let totalVersionMultiplier = 0;
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

            // Penalty if the meta deck fielded a special version the player
            // hasn't unlocked. The player's evolutionLevel encodes how far they've
            // unlocked the card: >= 1 owns the evolution, >= 2 owns the hero tier
            // (matching how the meta versions are detected from battle logs).
            let versionMultiplier = 1.0;
            if (cardVersions) {
                const metaCardVersion = cardVersions.find(c => c.cardId === cardId);
                if (metaCardVersion) {
                    const playerEvoLevel = playerCard.evolutionLevel ?? 0;

                    if (metaCardVersion.version === 'hero' && playerEvoLevel < 2) {
                        versionMultiplier = 0.90; // 10% penalty for missing hero
                    } else if (metaCardVersion.version === 'evo' && playerEvoLevel < 1) {
                        versionMultiplier = 0.90; // 10% penalty for missing evo
                    }
                }
            }

            totalVersionMultiplier += versionMultiplier;
        }

        const avgStatFraction = totalStatFraction / validCards;
        const avgVersionMultiplier = totalVersionMultiplier / validCards;
        // Score off the confidence-adjusted win rate so small-sample decks don't
        // outrank well-tested ones. Fall back to the raw rate for caches built
        // before confidence was stored.
        const metaStrength = metaDeck.confidence ?? metaDeck.winRate;
        // Down-rank decks the player can't field at full strength, grounded in the
        // game's per-level stat curve (see STAT_GROWTH_PER_LEVEL / LEVEL_SENSITIVITY).
        const levelWeight = Math.pow(avgStatFraction, DeckAnalyzer.LEVEL_SENSITIVITY);
        // Popularity is now a gate (applied at the top), not a multiplier: how many
        // players run a deck doesn't predict individual wins, so it no longer scales
        // the score. Decks rank on strength × how well the player can field them.
        const playerScore = metaStrength * levelWeight * avgVersionMultiplier;

        return playerScore;
    }

    // How many extra decks beyond the primary four to return as swap candidates.
    // The UI offers up to a few valid alternatives per slot after filtering out
    // decks that clash with the three decks being kept; meta decks share a lot of
    // cards, so we hand over a generous pool to draw from.
    private static readonly ALTERNATIVE_POOL_SIZE = 24;

    /** Build the player-facing ScoredDeck view of a meta deck. */
    private toScoredDeck(
        deck: DeckMeta,
        score: number,
        cardIdToCard: Map<number, PlayerItemLevel>
    ): ScoredDeck {
        const cards = deck.cardIds
            .map(id => cardIdToCard.get(id))
            .filter((card): card is PlayerItemLevel => card !== undefined);

        return {
            cardIds: deck.cardIds,
            metaWinRate: deck.winRate,
            confidence: deck.confidence ?? deck.winRate,
            uses: deck.uses,
            players: deck.players ?? 0,
            pickRate: deck.pickRate ?? 0,
            playerScore: score,
            cards,
            cardVersions: this.capEvolutions(this.personalizeVersions(deck.cardVersions, cardIdToCard)),
            metaCardVersions: this.capEvolutions(deck.cardVersions)
        };
    }

    /**
     * Greedily picks up to four mutually card-disjoint decks from a list already
     * sorted best-first — the war rule that no card is fielded twice across the
     * kept decks. Returns the chosen ScoredDecks and the set of source DeckMetas
     * picked, so the caller can exclude them from the swap pool.
     */
    private selectDisjointDecks(
        sortedDecks: Array<{ deck: DeckMeta; score: number }>,
        cardIdToCard: Map<number, PlayerItemLevel>
    ): { selectedDecks: ScoredDeck[]; selected: Set<DeckMeta> } {
        const selectedDecks: ScoredDeck[] = [];
        const selected = new Set<DeckMeta>();
        const usedCardIds = new Set<number>();
        for (const { deck, score } of sortedDecks) {
            if (selectedDecks.length >= 4) {
                break;
            }
            const hasConflict = deck.cardIds.some(id => usedCardIds.has(id));
            if (hasConflict) {
                continue;
            }
            deck.cardIds.forEach(id => usedCardIds.add(id));
            selected.add(deck);
            selectedDecks.push(this.toScoredDeck(deck, score, cardIdToCard));
        }
        return { selectedDecks, selected };
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

        // Apply the strictest popularity gate that still fills all four slots,
        // relaxing one step at a time for players whose collection can't field
        // four disjoint established decks (see POPULARITY_GATE_LADDER).
        let eligible: Array<{ deck: DeckMeta; score: number }> = [];
        let selectedDecks: ScoredDeck[] = [];
        let selected = new Set<DeckMeta>();
        for (const gate of DeckAnalyzer.POPULARITY_GATE_LADDER) {
            eligible = fieldable.filter(s => s.deck.players === undefined || s.deck.players >= gate);
            // Strength first; popularity only breaks exact ties now — its demoted
            // role (prefer the more established deck when scores are identical).
            eligible.sort((a, b) =>
                b.score !== a.score ? b.score - a.score : (b.deck.players ?? 0) - (a.deck.players ?? 0)
            );
            const picked = this.selectDisjointDecks(eligible, cardIdToCard);
            selectedDecks = picked.selectedDecks;
            selected = picked.selected;
            if (selectedDecks.length >= 4) {
                break; // strictest gate that fills all four wins
            }
            // Otherwise relax to the next gate; the loosest step is our best effort.
        }

        // The swap pool: the next best-scoring decks (at the gate we settled on)
        // that weren't chosen as one of the four. Unlike the four, these may
        // overlap each other and the primaries — the UI enforces card-disjointness
        // against the three kept decks when a swap actually happens.
        const alternatives: ScoredDeck[] = [];
        for (const { deck, score } of eligible) {
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
