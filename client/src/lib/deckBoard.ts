// The War Deck Builder's board: 4 decks × 8 slots of card ids, plus per-slot
// evo/hero art choices. Persisted in sessionStorage so the board survives
// navigation and so Best Decks can hand a full set straight to the builder.

export const DECK_COUNT = 4;
export const SLOTS_PER_DECK = 8;

// Champions may only occupy the hero + both slots (positional indices 1 and 2).
export const CHAMPION_SLOTS = [1, 2];

export type DeckState = (number | null)[][];
export type SpecialVersion = 'evo' | 'hero';
/** Art override per slot, keyed `${deckIndex}-${slotIndex}`. */
export type SlotVersionMap = Record<string, SpecialVersion>;

export const slotKey = (deckIndex: number, slotIndex: number) => `${deckIndex}-${slotIndex}`;

export const emptyDecks = (): DeckState =>
  Array.from({ length: DECK_COUNT }, () =>
    Array.from({ length: SLOTS_PER_DECK }, () => null)
  );

const DECKS_KEY = 'wdb_decks';
const VERSIONS_KEY = 'wdb_slotVersion';

function load<T>(key: string, fallback: T): T {
  try {
    const saved = sessionStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

export const loadDecks = (): DeckState => load(DECKS_KEY, emptyDecks());
export const loadSlotVersions = (): SlotVersionMap => load(VERSIONS_KEY, {});

export const saveDecks = (decks: DeckState) =>
  sessionStorage.setItem(DECKS_KEY, JSON.stringify(decks));
export const saveSlotVersions = (versions: SlotVersionMap) =>
  sessionStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
