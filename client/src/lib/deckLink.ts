// Build a Clash Royale "copy deck" deep link that loads the eight cards into the
// in-game deck editor. Format is a semicolon-separated list of the eight card IDs:
//   https://link.clashroyale.com/deck/en?deck=ID1;ID2;...;ID8
// Evo slots and the tower troop have optional params, but they aren't reliably
// documented and an unrecognised param makes the game reject the whole link, so
// we stick to the eight IDs. The player re-applies evolutions in the editor.
export function buildDeckLink(cardIds: Array<number | null | undefined>): string {
  const ids = cardIds.filter((id): id is number => typeof id === 'number');
  return `https://link.clashroyale.com/deck/en?deck=${ids.join(';')}`;
}

// A deck link only makes sense once all eight slots are filled: a partial deck
// would open with gaps or be rejected. Callers gate the button on this.
export function isCompleteDeck(cardIds: Array<number | null | undefined>): boolean {
  return cardIds.filter((id) => typeof id === 'number').length === 8;
}
