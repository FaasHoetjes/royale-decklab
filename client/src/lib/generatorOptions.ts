// Generator options (number of decks, minimum card level, banned / required cards, locked decks).
// They live in the URL, so a link reproduces the same lineup; the API takes the same query parameters.

export const MAX_DECKS = 4;
export const MAX_LEVEL = 16;
const CARDS_PER_DECK = 8;
const DEFAULTS_KEY = 'generator_defaults';

export interface GeneratorOptions {
  decks: number;
  minLevel: number | null;
  ban: number[];
  require: number[];
  lock: number[][];
}

export const DEFAULT_OPTIONS: GeneratorOptions = { decks: MAX_DECKS, minLevel: null, ban: [], require: [], lock: [] };

export const deckKey = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');

const ids = (raw: string | null) =>
  [...new Set((raw ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/** Reads options from the URL, dropping anything the API would reject (hand-edited or stale links). */
export function parseOptions(params: URLSearchParams): GeneratorOptions {
  const stored = loadDefaults();
  const decksRaw = params.get('decks');
  const minRaw = params.get('minLevel');
  const decks = decksRaw != null ? Number(decksRaw) : stored.decks;
  const minLevel = minRaw != null ? Number(minRaw) : stored.minLevel;

  const ban = ids(params.get('ban'));
  const require = ids(params.get('require')).filter((id) => !ban.includes(id));
  const lock: number[][] = [];
  const lockedCards = new Set<number>();
  for (const raw of params.getAll('lock')) {
    const deck = ids(raw);
    if (deck.length !== CARDS_PER_DECK || deck.some((id) => lockedCards.has(id) || ban.includes(id))) continue;
    deck.forEach((id) => lockedCards.add(id));
    lock.push(deck);
  }

  const validDecks = Number.isInteger(decks) && decks >= 1 && decks <= MAX_DECKS ? decks : MAX_DECKS;
  return {
    decks: validDecks,
    minLevel: minLevel != null && Number.isInteger(minLevel) && minLevel >= 1 && minLevel <= MAX_LEVEL ? minLevel : null,
    ban,
    require,
    lock: lock.slice(0, validDecks),
  };
}

/** Query string for both the page URL and the API call; empty when nothing is set. */
export function toQuery(options: GeneratorOptions): string {
  const params = new URLSearchParams();
  if (options.decks !== MAX_DECKS) params.set('decks', String(options.decks));
  if (options.minLevel != null) params.set('minLevel', String(options.minLevel));
  if (options.ban.length) params.set('ban', options.ban.join(','));
  if (options.require.length) params.set('require', options.require.join(','));
  options.lock.forEach((deck) => params.append('lock', deck.join(',')));
  // Commas are legal in a query string and keep the URL readable.
  return params.toString().replace(/%2C/g, ',');
}

/** The query a fresh search starts with: only the remembered number of decks and minimum level. */
export const startingQuery = () => toQuery(parseOptions(new URLSearchParams()));

export const hasActiveOptions = (o: GeneratorOptions) =>
  o.decks !== MAX_DECKS || o.minLevel != null || o.ban.length > 0 || o.require.length > 0 || o.lock.length > 0;

// Number of decks and minimum level are personal preferences, so they carry over to the next search.
function loadDefaults(): Pick<GeneratorOptions, 'decks' | 'minLevel'> {
  try {
    const saved = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? 'null');
    return {
      decks: typeof saved?.decks === 'number' ? saved.decks : MAX_DECKS,
      minLevel: typeof saved?.minLevel === 'number' ? saved.minLevel : null,
    };
  } catch {
    return { decks: MAX_DECKS, minLevel: null };
  }
}

export function saveDefaults(options: GeneratorOptions): void {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ decks: options.decks, minLevel: options.minLevel }));
  } catch {
    // Storage blocked (private mode): the options still work through the URL.
  }
}
