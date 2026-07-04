// Sort + type-filter logic for the card picker.
import type { BuilderCard } from './builderCards';
import { displayLevel } from './cardDisplay';

export const SORT_TYPES = ['Name', 'Level', 'Elixir', 'Rarity'] as const;
export type SortType = (typeof SORT_TYPES)[number];

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  champion: 4,
};

export const FILTER_OPTIONS = [
  { key: 'evolution', label: 'Evolution' },
  { key: 'troop', label: 'Troop' },
  { key: 'spell', label: 'Spell' },
  { key: 'building', label: 'Building' },
  { key: 'champion', label: 'Hero & Champion' },
] as const;
export type FilterKey = (typeof FILTER_OPTIONS)[number]['key'];

/** Type filters that can't co-exist — a card has exactly one of these types. */
export const EXCLUSIVE_TYPES: FilterKey[] = ['troop', 'spell', 'building'];

// The picker's filters + sort persist in sessionStorage (like the board in
// deckBoard.ts), so reopening the picker after navigating away keeps them.
const PREFS_KEY = 'wdb_pickerPrefs';

export interface PickerPrefs {
  filters: FilterKey[];
  sortIndex: number;
  descending: boolean;
}

const DEFAULT_PREFS: PickerPrefs = { filters: [], sortIndex: 0, descending: false };

export function loadPickerPrefs(): PickerPrefs {
  try {
    const saved = sessionStorage.getItem(PREFS_KEY);
    if (!saved) return DEFAULT_PREFS;
    const parsed = JSON.parse(saved) as Partial<PickerPrefs>;
    const validKeys = new Set<string>(FILTER_OPTIONS.map((o) => o.key));
    return {
      filters: Array.isArray(parsed.filters)
        ? parsed.filters.filter((k): k is FilterKey => typeof k === 'string' && validKeys.has(k))
        : [],
      sortIndex:
        typeof parsed.sortIndex === 'number' &&
        Number.isInteger(parsed.sortIndex) &&
        parsed.sortIndex >= 0 &&
        parsed.sortIndex < SORT_TYPES.length
          ? parsed.sortIndex
          : 0,
      descending: parsed.descending === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePickerPrefs(prefs: PickerPrefs): void {
  sessionStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// A few cards fall outside the troop id range but are really troops.
const TROOP_OVERRIDES = new Set<number>([
  27000010, // Furnace
  28000016, // Heal Spirit
  28000025, // Spirit Empress
]);

// Card type derives from the official id ranges: 26xxxxxx troops,
// 27xxxxxx buildings, 28xxxxxx spells.
function cardType(card: BuilderCard): 'troop' | 'building' | 'spell' | 'other' {
  if (TROOP_OVERRIDES.has(card.id)) return 'troop';
  if (card.id >= 28000000) return 'spell';
  if (card.id >= 27000000) return 'building';
  if (card.id >= 26000000) return 'troop';
  return 'other';
}

/**
 * Every active filter must apply (intersection) — "Evolution + Building" means
 * buildings that have an evolution. Heroes still count as troops; champions
 * are their own rarity and live only under "Hero & Champion".
 */
export function matchesFilters(card: BuilderCard, active: Set<FilterKey>): boolean {
  if (active.size === 0) return true;
  if (active.has('evolution') && !card.iconUrls?.evolutionMedium) return false;

  const isChampion = card.rarity === 'champion';
  const typeChecks: Array<[FilterKey, boolean]> = [
    ['troop', cardType(card) === 'troop' && !isChampion],
    ['spell', cardType(card) === 'spell'],
    ['building', cardType(card) === 'building'],
    ['champion', isChampion || !!card.isHero],
  ];
  return typeChecks.every(([key, matches]) => !active.has(key) || matches);
}

/** Owned level on the /16 scale, or -1 for unowned (sorts last). */
export function ownedLevel(card: BuilderCard): number {
  return card.owned && card.level != null && card.maxLevel != null
    ? displayLevel(card.level, card.maxLevel)
    : -1;
}

export function sortCards(cards: BuilderCard[], sortType: SortType, descending: boolean): BuilderCard[] {
  const dir = descending ? -1 : 1;
  const byName = (a: BuilderCard, b: BuilderCard) => a.name.localeCompare(b.name);

  const copy = [...cards];
  copy.sort((a, b) => {
    let cmp: number;
    switch (sortType) {
      case 'Level': {
        // Owned cards always come before unowned, regardless of direction.
        const aOwned = ownedLevel(a) >= 0;
        const bOwned = ownedLevel(b) >= 0;
        if (aOwned !== bOwned) return aOwned ? -1 : 1;
        cmp = ownedLevel(a) - ownedLevel(b);
        break;
      }
      case 'Elixir':
        cmp = (a.elixirCost ?? 99) - (b.elixirCost ?? 99);
        break;
      case 'Rarity':
        cmp = (RARITY_ORDER[a.rarity ?? ''] ?? 99) - (RARITY_ORDER[b.rarity ?? ''] ?? 99);
        break;
      case 'Name':
      default:
        cmp = byName(a, b);
        break;
    }
    if (cmp === 0) cmp = byName(a, b);
    return cmp * dir;
  });
  return copy;
}

/**
 * The grid art for a card under the active filters: the Evolution / Hero &
 * Champion filters show the special art for cards whose special the player
 * owns, preferring hero art when both filters are on.
 */
export function pickerIconUrl(card: BuilderCard, filters: Set<FilterKey>): string | undefined {
  if (filters.has('champion') && card.ownsHero) {
    return card.iconUrls?.heroMedium ?? card.iconUrls?.evolutionMedium ?? card.iconUrls?.medium;
  }
  if (filters.has('evolution') && card.hasEvo && card.iconUrls?.evolutionMedium) {
    return card.iconUrls.evolutionMedium;
  }
  return card.iconUrls?.medium;
}
