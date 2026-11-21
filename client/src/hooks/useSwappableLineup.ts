import { useMemo, useRef, useState } from 'react';
import type { ScoredDeck } from '../api';
import type { SwapOption } from '../components/SwapDeckModal';
import { alignToReference, inOrder, orderBySlots, slotVersionOf } from '../lib/cardDisplay';
import { deckKey } from '../lib/generatorOptions';
import { swapCandidates } from '../lib/swapCandidates';

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
  /** Decks kept while the others are re-picked around them; each stays in the slot it was locked in. */
  locks?: number[][];
  onLocksChange?: (locks: number[][]) => void;
  /** A deck's card order to show before the player swaps anything, if not the usual one. */
  shownOrder?: (deck: ScoredDeck) => number[] | undefined;
}

/**
 * A generated lineup the player can swap decks in. Decks are addressed by index into `decks` followed by
 * `alternatives`; a swap keeps the cards of the new deck lined up with the ones of the deck it replaces.
 */
export function useSwappableLineup(
  decks: ScoredDeck[],
  alternatives: ScoredDeck[],
  { locks, onLocksChange, shownOrder }: Arrangement = {}
) {
  const lockedKeys = useMemo(() => new Set((locks ?? []).map(deckKey)), [locks]);
  // Where each deck was when it was locked: the API returns locked decks first, but they should stay put.
  const lockPositions = useRef(new Map<string, number>());
  const arrangeSlots = (): number[] => {
    const order: (number | null)[] = decks.map(() => null);
    const rest: number[] = [];
    decks.forEach((deck, i) => {
      const key = deckKey(deck.cardIds);
      const pos = lockedKeys.has(key) ? lockPositions.current.get(key) : undefined;
      if (pos != null && pos < order.length && order[pos] == null) order[pos] = i;
      else rest.push(i);
    });
    return order.map((master) => master ?? rest.shift()!);
  };
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

  const candidatesForSlot = (slotPos: number): number[] => swapCandidates([...decks, ...alternatives], slots, slotPos);

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

  const isLocked = (slotPos: number) => lockedKeys.has(deckKey(deckAt(slots[slotPos]!).cardIds));
  const toggleLock = (slotPos: number) => {
    const deck = deckAt(slots[slotPos]!);
    const key = deckKey(deck.cardIds);
    if (lockedKeys.has(key)) {
      lockPositions.current.delete(key);
      onLocksChange?.((locks ?? []).filter((d) => deckKey(d) !== key));
    } else {
      lockPositions.current.set(key, slotPos);
      onLocksChange?.([...(locks ?? []), deck.cardIds]);
    }
  };

  /** Back to the lineup as generated; clearing the locks themselves is up to the caller. */
  const reset = () => {
    setSlotState((prev) => ({ ...prev, slots: prev.arranged, orders: {} }));
    lockPositions.current.clear();
  };

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
    isLocked,
    toggleLock,
    reset,
  };
}
