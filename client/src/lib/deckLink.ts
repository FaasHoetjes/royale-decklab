// Evo/tower params exist but are undocumented, and an unrecognised param makes
// the game reject the whole link, so only the eight card IDs are sent.
export function buildDeckLink(cardIds: Array<number | null | undefined>): string {
  const ids = cardIds.filter((id): id is number => typeof id === 'number');
  return `https://link.clashroyale.com/deck/en?deck=${ids.join(';')}`;
}

export function isCompleteDeck(cardIds: Array<number | null | undefined>): boolean {
  return cardIds.filter((id) => typeof id === 'number').length === 8;
}
