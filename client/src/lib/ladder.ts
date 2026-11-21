import type { LadderModeId } from '../api';

export interface LadderPlace {
  name: string;
  /** Arena number on Trophy Road, league number in Ranked. */
  number: number;
  /** Trophy Road: the trophies the arena starts at. Ranked: the league number. */
  floor: number;
  art: string;
}

export const LOWEST_RANGE = 4000;
export const RANGE_WIDTH = 1000;

const arena = (number: number, name: string, floor: number): LadderPlace => ({ name, number, floor, art: `/arenas/${number}.webp` });

const SPOOKY_TOWN = arena(12, 'Spooky Town', 3800);

/** The arenas from the lowest range followed up; each starts at its floor and runs to the next one's. */
export const ARENAS: LadderPlace[] = [
  SPOOKY_TOWN,
  arena(13, "Rascal's Hideout", 4200),
  arena(14, 'Serenity Peak', 4600),
  arena(15, "Miner's Mine", 5000),
  arena(16, "Executioner's Kitchen", 5500),
  arena(17, 'Royal Crypt', 6000),
  arena(18, 'Silent Sanctuary', 6500),
  arena(19, 'Dragon Spa', 7000),
  arena(20, 'Boot Camp', 7500),
  arena(21, 'Clash Fest', 8000),
  arena(22, 'PANCAKES!', 8500),
  arena(23, 'Valkalla', 9000),
  arena(24, 'Legendary Arena', 9500),
  arena(25, 'Lumberlove Cabin', 10000),
  arena(26, 'Royal Road', 10500),
  arena(27, 'Musketeer Street', 11000),
  arena(28, 'Summit of Heroes', 11500),
  arena(29, 'Magic Academy', 12000),
  arena(30, 'Ultimate Clash Pit', 12500),
  arena(31, 'Tavern', 13000),
  arena(32, 'Spirit Square', 13500),
];

const LEAGUE_NAMES = ['Master I', 'Master II', 'Master III', 'Champion', 'Grand Champion', 'Royal Champion', 'Ultimate Champion'];

export const LEAGUES: LadderPlace[] = LEAGUE_NAMES.map((name, i) => ({ name, number: i + 1, floor: i + 1, art: `/ranked/${i + 1}.webp` }));

const MASTER_I = LEAGUES[0] as LadderPlace;

export function arenaFor(trophies: number): LadderPlace {
  return ARENAS.findLast((a) => trophies >= a.floor) ?? SPOOKY_TOWN;
}

export function nextArena(trophies: number): LadderPlace | undefined {
  return ARENAS.find((a) => a.floor > trophies);
}

export function leagueFor(league: number): LadderPlace {
  return LEAGUES.findLast((l) => league >= l.number) ?? MASTER_I;
}

/** The range or league a place's battles are counted in. */
export function rangeOf(mode: LadderModeId, place: LadderPlace): number {
  if (mode === 'ranked') return place.floor;
  return Math.max(LOWEST_RANGE, Math.floor(place.floor / RANGE_WIDTH) * RANGE_WIDTH);
}

/** Where the player is on the road: their arena, or the league the decks came from. */
export function placeOf(mode: LadderModeId, trophies: number, rangeFloor: number): LadderPlace {
  return mode === 'ranked' ? leagueFor(rangeFloor) : arenaFor(trophies);
}
