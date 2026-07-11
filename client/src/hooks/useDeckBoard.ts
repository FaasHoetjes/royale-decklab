import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
      if (free == null) return;
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
    if (touchDrag.current) {
      e.preventDefault();
      return;
    }
    if (decks[slot.deckIndex]?.[slot.slotIndex] == null) {
      e.preventDefault();
      return;
    }
    setDragSource(slot);
    e.dataTransfer.effectAllowed = 'move';
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

  const touchDrag = useRef<{ slot: SlotRef; startX: number; startY: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);

  const slotFromPoint = (x: number, y: number): SlotRef | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-deck-index]');
    if (!(el instanceof HTMLElement)) return null;
    return { deckIndex: Number(el.dataset.deckIndex), slotIndex: Number(el.dataset.slotIndex) };
  };

  const handlePointerDown = (e: ReactPointerEvent, slot: SlotRef) => {
    if (e.pointerType === 'mouse') return;
    if (decks[slot.deckIndex]?.[slot.slotIndex] == null) return;
    touchDrag.current = { slot, startX: e.clientX, startY: e.clientY, active: false };
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    const t = touchDrag.current;
    if (!t) return;
    if (!t.active) {
      const dx = e.clientX - t.startX;
      const dy = e.clientY - t.startY;
      if (dx * dx + dy * dy < 36) return;
      t.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragSource(t.slot);
    }
    const over = slotFromPoint(e.clientX, e.clientY);
    setDragOver((prev) =>
      prev?.deckIndex === over?.deckIndex && prev?.slotIndex === over?.slotIndex ? prev : over
    );
    const margin = 90;
    if (e.clientY < margin) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - margin) window.scrollBy(0, 14);
  };

  const handlePointerUp = (e: ReactPointerEvent) => {
    const t = touchDrag.current;
    touchDrag.current = null;
    if (!t?.active) return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 150);
    const target = slotFromPoint(e.clientX, e.clientY);
    if (target && !isChampionViolation(t.slot, target)) {
      swapSlots(t.slot, target);
    }
    setDragSource(null);
    setDragOver(null);
  };

  const handlePointerCancel = () => {
    if (!touchDrag.current) return;
    touchDrag.current = null;
    setDragSource(null);
    setDragOver(null);
  };

  const handleContextMenu = (e: ReactMouseEvent) => {
    if (touchDrag.current) e.preventDefault();
  };

  const consumeDragClick = () => {
    const v = suppressClick.current;
    suppressClick.current = false;
    return v;
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
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleContextMenu,
    consumeDragClick,
  };
}
