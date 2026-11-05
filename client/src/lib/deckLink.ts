import { SLOTS_PER_DECK } from './deckBoard';

const PRINCESS_TOWER_TROOP_ID = 159000000;

export function buildDeckLink(cardIds: Array<number | null | undefined>): string {
  const ids = cardIds.filter((id): id is number => typeof id === 'number');
  return `https://link.clashroyale.com/en?clashroyale://copyDeck?deck=${ids.join(';')}&tt=${PRINCESS_TOWER_TROOP_ID}`;
}

export function isCompleteDeck(cardIds: Array<number | null | undefined>): boolean {
  return cardIds.filter((id) => typeof id === 'number').length === SLOTS_PER_DECK;
}
