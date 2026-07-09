import { useEffect, useMemo, useState, type DragEvent } from 'react';
import type { BuilderCard } from '../lib/builderCards';
import {
  CHAMPION_SLOTS,
  SLOTS_PER_DECK,
  slotKey,
  emptyDecks,
  loadDecks,
  loadSlotVersions,
  saveDecks,
  saveSlotVersions,
  type DeckState,
  type SlotVersionMap,
  type SpecialVersion,
} from '../lib/deckBoard';

export interface SlotRef {
  deckIndex: number;
  slotIndex: number;
}

export type DeckBoard = ReturnType<typeof useDeckBoard>;

export function useDeckBoard(cardById: Map<number, BuilderCard>) {
  const [decks, setDecks] = useState<DeckState>(loadDecks);
  const [slotVersion, setSlotVersion] = useState<SlotVersionMap>(loadSlotVersions);

  const [dragSource, setDragSource] = useState<SlotRef | null>(null);
  const [dragOver, setDragOver] = useState<SlotRef | null>(null);

  useEffect(() => { saveDecks(decks); }, [decks]);
  useEffect(() => { saveSlotVersions(slotVersion); }, [slotVersion]);

  const usedIds = useMemo(() => {
    const set = new Set<number>();
    decks.forEach((deck) => deck.forEach((id) => id != null && set.add(id)));
    return set;
  }, [decks]);

  const clearVersions = (...keys: string[]) =>
    setSlotVersion((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });

  const setSlot = (deckIndex: number, slotIndex: number, value: number | null) => {
    setDecks((prev) =>
      prev.map((deck, di) =>
        di === deckIndex ? deck.map((id, si) => (si === slotIndex ? value : id)) : deck
      )
    );
    clearVersions(slotKey(deckIndex, slotIndex));
  };

  const placeCard = (target: SlotRef, cardId: number) => {
    const card = cardById.get(cardId);
    let slotIndex = target.slotIndex;
    if (card?.rarity === 'champion' && !CHAMPION_SLOTS.includes(slotIndex)) {
      const free = CHAMPION_SLOTS.find((i) => decks[target.deckIndex]?.[i] == null);
      if (free == null) return; // no room; the picker greys champions out
      slotIndex = free;
    }
    setSlot(target.deckIndex, slotIndex, cardId);
  };

  const swapSlots = (a: SlotRef, b: SlotRef) => {
    if (a.deckIndex === b.deckIndex && a.slotIndex === b.slotIndex) return;
    setDecks((prev) => {
      const next = prev.map((deck) => [...deck]);
      const tmp = next[a.deckIndex]![a.slotIndex]!;
      next[a.deckIndex]![a.slotIndex] = next[b.deckIndex]![b.slotIndex]!;
      next[b.deckIndex]![b.slotIndex] = tmp;
      return next;
    });
    clearVersions(slotKey(a.deckIndex, a.slotIndex), slotKey(b.deckIndex, b.slotIndex));
  };

  const isChampionViolation = (src: SlotRef, tgt: SlotRef): boolean => {
    const rarityAt = ({ deckIndex, slotIndex }: SlotRef) => {
      const id = decks[deckIndex]?.[slotIndex];
      return id != null ? cardById.get(id)?.rarity : undefined;
    };
    return (
      (rarityAt(src) === 'champion' && !CHAMPION_SLOTS.includes(tgt.slotIndex)) ||
      (rarityAt(tgt) === 'champion' && !CHAMPION_SLOTS.includes(src.slotIndex))
    );
  };

  const resetDeck = (deckIndex: number) => {
    setDecks((prev) =>
      prev.map((deck, di) => (di === deckIndex ? deck.map(() => null) : deck))
    );
    clearVersions(...Array.from({ length: SLOTS_PER_DECK }, (_, si) => slotKey(deckIndex, si)));
  };

  const resetAll = () => {
    setDecks(emptyDecks());
    setSlotVersion({});
  };

  const toggleVersion = (deckIndex: number, slotIndex: number, versions: SpecialVersion[]) => {
    const key = slotKey(deckIndex, slotIndex);
    setSlotVersion((prev) => {
      const current = prev[key] ?? versions[0];
      const other = versions.find((v) => v !== current) ?? versions[0]!;
      return { ...prev, [key]: other };
    });
  };

  const handleDragStart = (e: DragEvent, slot: SlotRef) => {
    if (decks[slot.deckIndex]?.[slot.slotIndex] == null) {
      e.preventDefault();
      return;
    }
    setDragSource(slot);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set for a drag to actually start.
    e.dataTransfer.setData('text/plain', `${slot.deckIndex}:${slot.slotIndex}`);
  };

  const handleDragOver = (e: DragEvent, slot: SlotRef) => {
    if (!dragSource) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = isChampionViolation(dragSource, slot) ? 'none' : 'move';
    if (dragOver?.deckIndex !== slot.deckIndex || dragOver?.slotIndex !== slot.slotIndex) {
      setDragOver(slot);
    }
  };

  const handleDrop = (e: DragEvent, slot: SlotRef) => {
    e.preventDefault();
    if (!dragSource) return;
    if (!isChampionViolation(dragSource, slot)) {
      swapSlots(dragSource, slot);
    }
    setDragSource(null);
    setDragOver(null);
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOver(null);
  };

  return {
    decks,
    slotVersion,
    usedIds,
    dragSource,
    dragOver,
    setSlot,
    placeCard,
    resetDeck,
    resetAll,
    toggleVersion,
    isChampionViolation,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
