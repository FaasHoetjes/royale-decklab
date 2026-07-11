export function buildDeckLink(cardIds: Array<number | null | undefined>): string {
  const ids = cardIds.filter((id): id is number => typeof id === 'number');
  return `https://link.clashroyale.com/deck/en?deck=${ids.join(';')}`;
}

export function isCompleteDeck(cardIds: Array<number | null | undefined>): boolean {
  return cardIds.filter((id) => typeof id === 'number').length === 8;
}
