import { DeckMeta, PlayerItemLevel, ScoredDeck, WarDeckResult } from '../models/models';

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

            // Calculate version penalty if meta deck requires specific EVO/hero versions
            let versionMultiplier = 1.0;
            if (cardVersions) {
                const metaCardVersion = cardVersions.find(c => c.cardId === cardId);
                if (metaCardVersion) {
                    // Check if player has the required version
                    const hasHero = (playerCard as any).heroMedium !== undefined;
                    const hasEvo = (playerCard as any).evolutionLevel !== undefined && (playerCard as any).evolutionLevel > 0;

                    if (metaCardVersion.version === 'hero' && !hasHero) {
                        versionMultiplier = 0.80; // 20% penalty for missing hero
                    } else if (metaCardVersion.version === 'evo' && !hasEvo && !hasHero) {
                        versionMultiplier = 0.90; // 10% penalty for missing evo (when hero not available)
                    }
                }
            }

            totalVersionMultiplier += versionMultiplier;
        }

        const avgLevelRatio = totalLevelRatio / validCards;
        const avgVersionMultiplier = totalVersionMultiplier / validCards;
        const playerScore = metaDeck.winRate * avgLevelRatio * avgVersionMultiplier;

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
                playerScore: score,
                cards
            });
        }

        const totalScore = selectedDecks.reduce((sum, deck) => sum + deck.playerScore, 0);

        return {
            decks: selectedDecks,
            totalScore
        };
    }
}
