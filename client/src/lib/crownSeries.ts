import type { CrownSeriesLeagueId } from '../api';

export interface CrownSeriesLeague {
  id: CrownSeriesLeagueId;
  name: string;
  levelCap: number;
}

const KINGS: CrownSeriesLeague = { id: 'kings', name: "King's", levelCap: 16 };

export const LEAGUES: CrownSeriesLeague[] = [
  { id: 'dagger', name: 'Dagger', levelCap: 11 },
  { id: 'pancake', name: 'Pancake', levelCap: 11 },
  { id: 'mustache', name: 'Mustache', levelCap: 12 },
  { id: 'magic', name: 'Magic', levelCap: 12 },
  { id: 'hammer', name: 'Hammer', levelCap: 13 },
  { id: 'armor', name: 'Armor', levelCap: 13 },
  { id: 'phantom', name: 'Phantom', levelCap: 14 },
  { id: 'queens', name: "Queen's", levelCap: 15 },
  KINGS,
];

export const DEFAULT_LEAGUE = KINGS.id;
export const DUEL_DECK_SIZES = [3, 4] as const;
export type DuelDeckSize = (typeof DUEL_DECK_SIZES)[number];

const STORAGE_KEY = 'crownSeriesLeague';

export function leagueOf(value: string | null): CrownSeriesLeague | undefined {
  return LEAGUES.find((league) => league.id === value);
}

/** The league named in the link, else the one last picked, else King's. */
export function leagueFor(value: string | null): CrownSeriesLeague {
  return leagueOf(value) ?? leagueOf(loadLeague()) ?? KINGS;
}

export function deckSizeOf(value: string | null): DuelDeckSize {
  return value === '3' ? 3 : 4;
}

export function loadLeague(): CrownSeriesLeagueId {
  try {
    return leagueOf(localStorage.getItem(STORAGE_KEY))?.id ?? DEFAULT_LEAGUE;
  } catch {
    return DEFAULT_LEAGUE;
  }
}

export function saveLeague(league: CrownSeriesLeagueId): void {
  try {
    localStorage.setItem(STORAGE_KEY, league);
  } catch {
    // Storage can be full or blocked; the league just isn't remembered.
  }
}
