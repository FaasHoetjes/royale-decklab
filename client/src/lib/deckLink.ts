export function buildDeckLink(cardIds: Array<number | null | undefined>): string {
  const ids = cardIds.filter((id): id is number => typeof id === 'number');
  // Princess tower
  const DEFAULT_TOWER_TROOP = 159000000;
  return `https://link.clashroyale.com/en?clashroyale://copyDeck?deck=${ids.join(';')}&tt=${DEFAULT_TOWER_TROOP}`;
}

export function isCompleteDeck(cardIds: Array<number | null | undefined>): boolean {
  return cardIds.filter((id) => typeof id === 'number').length === 8;
}
