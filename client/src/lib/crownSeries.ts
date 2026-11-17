import type { CrownSeriesLeagueId } from '../api';

export interface CrownSeriesLeague {
  id: CrownSeriesLeagueId;
  name: string;
  levelCap: number;
  shield: string;
  /** Tints the banner and the picker. */
  color: string;
  glow: string;
}

export const CROWN_SERIES_LOGO = '/crown-series/logo.webp';

const league = (id: CrownSeriesLeagueId, name: string, levelCap: number, color: string, glow: string): CrownSeriesLeague => ({
  id,
  name,
  levelCap,
  shield: `/crown-series/${id}.webp`,
  color,
  glow,
});

const KINGS = league('kings', "King's", 16, '#2a63d6', 'rgba(255, 205, 80, 0.65)');

export const LEAGUES: CrownSeriesLeague[] = [
  league('dagger', 'Dagger', 11, '#8a5a3c', 'rgba(214, 150, 96, 0.55)'),
  league('pancake', 'Pancake', 11, '#7b8088', 'rgba(200, 205, 215, 0.5)'),
  league('mustache', 'Mustache', 12, '#b8642e', 'rgba(240, 150, 90, 0.55)'),
  league('magic', 'Magic', 12, '#1f7fe0', 'rgba(80, 170, 255, 0.6)'),
  league('hammer', 'Hammer', 13, '#e57a14', 'rgba(255, 160, 60, 0.6)'),
  league('armor', 'Armor', 13, '#9d4fdc', 'rgba(200, 120, 255, 0.6)'),
  league('phantom', 'Phantom', 14, '#21a050', 'rgba(80, 220, 130, 0.55)'),
  league('queens', "Queen's", 15, '#8443c4', 'rgba(190, 120, 255, 0.6)'),
  KINGS,
];

export const DEFAULT_LEAGUE = KINGS.id;

const STORAGE_KEY = 'crownSeriesLeague';

export function leagueOf(value: string | null): CrownSeriesLeague | undefined {
  return LEAGUES.find((league) => league.id === value);
}

/** The league named in the link, else the one last picked, else King's. */
export function leagueFor(value: string | null): CrownSeriesLeague {
  return leagueOf(value) ?? leagueOf(loadLeague()) ?? KINGS;
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
