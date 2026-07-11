export const DECK_COUNT = 4;
export const SLOTS_PER_DECK = 8;

// Champions may only occupy the hero + both slots (positional indices 1 and 2).
export const CHAMPION_SLOTS = [1, 2];

export type DeckState = (number | null)[][];
export type SpecialVersion = 'evo' | 'hero';
export type SlotVersionMap = Record<string, SpecialVersion>;

export const slotKey = (deckIndex: number, slotIndex: number) => `${deckIndex}-${slotIndex}`;

export const emptyDecks = (): DeckState =>
  Array.from({ length: DECK_COUNT }, () =>
    Array.from({ length: SLOTS_PER_DECK }, () => null)
  );

const DECKS_KEY = 'wdb_decks';
const VERSIONS_KEY = 'wdb_slotVersion';

function load(key: string): unknown {
  try {
    const saved = sessionStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

const isDeckState = (v: unknown): v is DeckState =>
  Array.isArray(v) &&
  v.length === DECK_COUNT &&
  v.every(
    (deck) =>
      Array.isArray(deck) &&
      deck.length === SLOTS_PER_DECK &&
      deck.every((slot) => slot === null || typeof slot === 'number')
  );

const isSlotVersionMap = (v: unknown): v is SlotVersionMap =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((x) => x === 'evo' || x === 'hero');

export const loadDecks = (): DeckState => {
  const saved = load(DECKS_KEY);
  return isDeckState(saved) ? saved : emptyDecks();
};

export const loadSlotVersions = (): SlotVersionMap => {
  const saved = load(VERSIONS_KEY);
  return isSlotVersionMap(saved) ? saved : {};
};

export const saveDecks = (decks: DeckState) =>
  sessionStorage.setItem(DECKS_KEY, JSON.stringify(decks));
export const saveSlotVersions = (versions: SlotVersionMap) =>
  sessionStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
