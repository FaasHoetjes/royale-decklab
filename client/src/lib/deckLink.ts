const PRINCESS_TOWER_TROOP_ID = 159000000;

export function buildDeckLink(cardIds: Array<number | null | undefined>): string {
  const ids = cardIds.filter((id): id is number => typeof id === 'number');
  return `https://link.clashroyale.com/en?clashroyale://copyDeck?deck=${ids.join(';')}&tt=${PRINCESS_TOWER_TROOP_ID}`;
}
