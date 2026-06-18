import { DeckMeta, PlayerItemLevel, popularityWeight, ScoredDeck, WarDeckResult } from '../models/models';

export default class DeckAnalyzer {
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
                        versionMultiplier = 0.80; // 20% penalty for missing hero
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

            const cards = deck.cardIds
                .map(id => cardIdToCard.get(id))
                .filter((card): card is PlayerItemLevel => card !== undefined);

            selectedDecks.push({
                cardIds: deck.cardIds,
                metaWinRate: deck.winRate,
                confidence: deck.confidence ?? deck.winRate,
                uses: deck.uses,
                players: deck.players ?? 0,
                pickRate: deck.pickRate ?? 0,
                playerScore: score,
                cards,
                cardVersions: deck.cardVersions
            });
        }

        const totalScore = selectedDecks.reduce((sum, deck) => sum + deck.playerScore, 0);

        return {
            decks: selectedDecks,
            totalScore
        };
    }
}
