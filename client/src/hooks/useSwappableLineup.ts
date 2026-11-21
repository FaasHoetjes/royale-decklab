import { useState } from 'react';
import type { ScoredDeck } from '../api';
import type { SwapOption } from '../components/SwapDeckModal';
import { alignToReference, inOrder, orderBySlots, slotVersionOf } from '../lib/cardDisplay';

interface KeptOrder {
  master: number;
  ids: number[];
}

interface LineupState {
  decks: ScoredDeck[];
  arranged: number[];
  slots: number[];
  orders: Record<number, KeptOrder>;
}

interface Arrangement {
  /** Which deck goes in each slot when a new lineup arrives, as indexes into `decks`. */
  arrange?: () => number[];
  /** A deck's card order to show before the player swaps anything, if not the usual one. */
  shownOrder?: (deck: ScoredDeck) => number[] | undefined;
}

/**
 * A generated lineup the player can swap decks in. Decks are addressed by index into `decks` followed by
 * `alternatives`; a swap keeps the cards of the new deck lined up with the ones of the deck it replaces.
 */
export function useSwappableLineup(decks: ScoredDeck[], alternatives: ScoredDeck[], { arrange, shownOrder }: Arrangement = {}) {
  const arrangeSlots = arrange ?? (() => decks.map((_, i) => i));
  const deckAt = (master: number): ScoredDeck => {
    const deck = master < decks.length ? decks[master] : alternatives[master - decks.length];
    if (!deck) throw new Error(`No deck at index ${master}`);
    return deck;
  };

  // Re-arranged in the same render a new result arrives, so old positions never index into the new list.
  // `arranged` is the lineup as generated; `slots` also reflects swaps made since.
  const [slotState, setSlotState] = useState<LineupState>(() => {
    const arranged = arrangeSlots();
    return { decks, arranged, slots: arranged, orders: {} };
  });
  let slots = slotState.slots;
  if (slotState.decks !== decks) {
    slots = arrangeSlots();
    setSlotState({ decks, arranged: slots, slots, orders: {} });
  }
  const swapped = slots.some((master, pos) => master !== slotState.arranged[pos]);

  const [swapSlot, setSwapSlot] = useState<number | null>(null);

  const candidatesForSlot = (slotPos: number): number[] => {
    const otherCards = new Set<number>();
    slots.forEach((master, pos) => {
      if (pos !== slotPos) deckAt(master).cardIds.forEach((id) => otherCards.add(id));
    });

    const base = [slots[slotPos]!, ...alternatives.map((_, k) => decks.length + k)];
    const valid = base.filter((master) => !deckAt(master).cardIds.some((id) => otherCards.has(id)));
    valid.sort((a, b) => deckAt(b).playerScore - deckAt(a).playerScore);
    return valid;
  };

  const swapOptions = (slotPos: number): SwapOption[] =>
    candidatesForSlot(slotPos).map((master) => {
      const d = deckAt(master);
      return {
        master,
        cards: d.cards,
        metaWinRate: d.metaWinRate,
        playerScore: d.playerScore,
        uses: d.uses,
        cardVersions: d.cardVersions,
        metaCardVersions: d.metaCardVersions,
      };
    });

  const cardOrderAt = (slotPos: number): number[] => {
    const master = slots[slotPos]!;
    const kept = slotState.orders[slotPos];
    if (kept?.master === master) return kept.ids;
    const deck = deckAt(master);
    return shownOrder?.(deck) ?? orderBySlots(deck.cards, slotVersionOf(deck.metaCardVersions, deck.cardVersions)).map((c) => c.id);
  };

  const selectForSlot = (slotPos: number, master: number) => {
    const current = deckAt(slots[slotPos]!);
    const next = deckAt(master);
    const ids = alignToReference(
      next.cards,
      slotVersionOf(next.metaCardVersions, next.cardVersions),
      inOrder(current.cards, cardOrderAt(slotPos))
    ).map((c) => c.id);
    setSlotState((prev) => ({
      ...prev,
      slots: prev.slots.map((m, pos) => (pos === slotPos ? master : m)),
      orders: { ...prev.orders, [slotPos]: { master, ids } },
    }));
    setSwapSlot(null);
  };

  const undoSwaps = () => setSlotState((prev) => ({ ...prev, slots: prev.arranged, orders: {} }));

  return {
    slots,
    shownDecks: slots.map(deckAt),
    deckAt,
    swapped,
    swapSlot,
    openSwap: setSwapSlot,
    closeSwap: () => setSwapSlot(null),
    swapOptions,
    cardOrderAt,
    selectForSlot,
    undoSwaps,
  };
}
