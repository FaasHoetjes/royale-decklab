// Build a Clash Royale "copy deck" deep link. Opening it on a device with the
// game installed loads the eight cards straight into the in-game deck editor.
//
// We use the canonical, long-stable format — a semicolon-separated list of the
// eight card IDs:
//   https://link.clashroyale.com/deck/en?deck=ID1;ID2;...;ID8
// Evolution slots and the tower troop have their own optional parameters, but
// those aren't reliably documented and an unrecognised parameter makes the game
// reject the whole link — so we stick to the eight IDs, which always works. The
// player applies their evolutions in the editor as usual (evolved cards they own
// slot in automatically).
export function buildDeckLink(cardIds: Array<number | null | undefined>): string {
  const ids = cardIds.filter((id): id is number => typeof id === 'number');
  return `https://link.clashroyale.com/deck/en?deck=${ids.join(';')}`;
}

// A deck link only makes sense once all eight slots are filled — a partial deck
// would open the editor with gaps (or be rejected). Callers gate the button on
// this so an incomplete deck doesn't offer a broken link.
export function isCompleteDeck(cardIds: Array<number | null | undefined>): boolean {
  return cardIds.filter((id) => typeof id === 'number').length === 8;
}
