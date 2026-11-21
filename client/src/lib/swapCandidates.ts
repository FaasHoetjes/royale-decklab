/**
 * The decks that could go in a slot, best first: every deck of the lineup or its alternatives that shares no cards
 * with the decks in the other slots. That includes the slot's own deck and a generated deck swapped out earlier.
 */
export function swapCandidates(
  allDecks: readonly { cardIds: number[]; playerScore: number }[],
  slots: readonly number[],
  slotPos: number
): number[] {
  const otherCards = new Set<number>();
  slots.forEach((master, pos) => {
    if (pos !== slotPos) allDecks[master]?.cardIds.forEach((id) => otherCards.add(id));
  });
  return allDecks
    .map((deck, master) => ({ deck, master }))
    .filter(({ deck }) => !deck.cardIds.some((id) => otherCards.has(id)))
    .sort((a, b) => b.deck.playerScore - a.deck.playerScore)
    .map(({ master }) => master);
}
