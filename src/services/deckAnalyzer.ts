import { CardVersion, DeckMeta, PlayerItemLevel, popularityWeight, ScoredDeck, WarDeckResult } from '../models/models';

export default class DeckAnalyzer {
    // In-game evolution slots: slot 1 takes an Evo, slot 2 a Hero, slot 3 either.
    // So a legal deck has at most 2 Evos, at most 2 Heroes, and at most 3 specials
    // overall. Correct meta data already respects this; the cap below is only a
    // safety net against a malformed deck slipping through.
    private static readonly MAX_EVO = 2;
    private static readonly MAX_HERO = 2;
    private static readonly MAX_SPECIALS = 3;

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

        let totalLevelRatio = 0;
        let totalVersionMultiplier = 0;
        let validCards = 0;

        for (const cardId of metaDeck.cardIds) {
            const playerCard = cardMap.get(cardId);
            if (!playerCard) {
                return null;
            }

            const levelRatio = playerCard.level / playerCard.maxLevel;
            totalLevelRatio += levelRatio;
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

        const avgLevelRatio = totalLevelRatio / validCards;
        const avgVersionMultiplier = totalVersionMultiplier / validCards;
        // Score off the confidence-adjusted win rate so small-sample decks don't
        // outrank well-tested ones. Fall back to the raw rate for caches built
        // before confidence was stored.
        const metaStrength = metaDeck.confidence ?? metaDeck.winRate;
        // Weight by how many distinct players run the deck: a deck one person
        // plays isn't really "meta" even at a high win rate. Caches built before
        // player counts existed get no penalty (undefined → weight 1).
        const popularity = metaDeck.players === undefined ? 1 : popularityWeight(metaDeck.players);
        const playerScore = metaStrength * popularity * avgLevelRatio * avgVersionMultiplier;

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

    findBestWarDecks(
        playerCards: PlayerItemLevel[],
        metaDecks: DeckMeta[],
        cardIdToCard: Map<number, PlayerItemLevel>
    ): WarDeckResult {
        const scoredDecks: Array<{ deck: DeckMeta; score: number }> = [];

        for (const metaDeck of metaDecks) {
            const score = this.scoreDecksForPlayer(playerCards, metaDeck, metaDeck.cardVersions);
            if (score !== null) {
                scoredDecks.push({ deck: metaDeck, score });
            }
        }

        scoredDecks.sort((a, b) => b.score - a.score);

        const selectedDecks: ScoredDeck[] = [];
        const selected = new Set<DeckMeta>();
        const usedCardIds = new Set<number>();

        for (const { deck, score } of scoredDecks) {
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

        // The swap pool: the next best-scoring decks that weren't chosen as one of
        // the four. Unlike the four, these may overlap each other and the primaries
        // — the UI enforces card-disjointness against the three kept decks when a
        // swap actually happens.
        const alternatives: ScoredDeck[] = [];
        for (const { deck, score } of scoredDecks) {
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
