import type { ClanRole, ClanWar, ClanWarMember, PastWarWeek } from '../api';

export const DECKS_PER_DAY = 4;
export const DECKS_PER_WEEK = 16;
const TRAINING_DAYS = 3;
const BATTLE_DAYS = 4;

export const dayLabel = (war: ClanWar): string => {
  if (war.period === 'training') return `Training day ${war.day} of ${TRAINING_DAYS}`;
  if (war.period === 'colosseum') return `Colosseum day ${war.day} of ${BATTLE_DAYS}`;
  return `War day ${war.day} of ${BATTLE_DAYS}`;
};

export const roleLabel = (role: ClanRole): string | null => {
  if (role === 'leader') return 'Leader';
  if (role === 'coLeader') return 'Co-leader';
  if (role === 'elder') return 'Elder';
  return null;
};

/** The decks a member could have used so far this week, counting today in full. */
export const decksAvailableThisWeek = (war: ClanWar): number => (war.isBattleDay ? war.day * DECKS_PER_DAY : 0);

export const lastWeek = (war: ClanWar): PastWarWeek | null => war.pastWeeks[0] ?? null;

export interface WeekBar {
  key: string;
  label: string;
  /** Null when the member wasn't in the clan that week. */
  decks: number | null;
}

/** The API lists past weeks newest first; bars read left to right, oldest first. */
export const pastWeekBars = (war: ClanWar, member: ClanWarMember): WeekBar[] =>
  war.pastWeeks
    .map((week, i) => ({
      key: `${week.seasonId}-${week.week}`,
      label: `Week ${week.week}`,
      decks: member.decksUsedPastWeeks[i] ?? null,
    }))
    .reverse();

export interface LastWeekTurnout {
  playedAll: number;
  missedSome: number;
}

/** How the current members did last week; members who weren't in the clan yet don't count. */
export const lastWeekTurnout = (war: ClanWar): LastWeekTurnout | null => {
  if (!lastWeek(war)) return null;
  const decks = war.members.map((m) => m.decksUsedPastWeeks[0]).filter((d): d is number => d != null);
  const playedAll = decks.filter((d) => d >= DECKS_PER_WEEK).length;
  return { playedAll, missedSome: decks.length - playedAll };
};
