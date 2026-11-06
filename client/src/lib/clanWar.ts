import type { ClanRole, ClanWar, ClanWarMember, PastWarWeek, RaceClan } from '../api';

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

export type TodayStatus = 'notStarted' | 'started' | 'done';

export const TODAY_STATUSES: TodayStatus[] = ['notStarted', 'started', 'done'];

export const todayStatusLabel: Record<TodayStatus, string> = {
  notStarted: 'Not started',
  started: 'Started',
  done: 'Done',
};

export const todayStatus = (member: ClanWarMember): TodayStatus => {
  if (member.decksLeftToday === 0) return 'done';
  return member.decksUsedToday > 0 ? 'started' : 'notStarted';
};

export const groupByToday = (members: ClanWarMember[]): Record<TodayStatus, ClanWarMember[]> => {
  const groups: Record<TodayStatus, ClanWarMember[]> = { notStarted: [], started: [], done: [] };
  members.forEach((member) => groups[todayStatus(member)].push(member));
  return groups;
};

export type Reliability = 'reliable' | 'steady' | 'slipping' | 'ghost' | 'new';

export const RELIABILITIES: Reliability[] = ['reliable', 'steady', 'slipping', 'ghost', 'new'];

export const reliabilityLabel: Record<Reliability, string> = {
  reliable: 'Reliable',
  steady: 'Steady',
  slipping: 'Slipping',
  ghost: 'Ghost',
  new: 'New',
};

const SLIPPING_BELOW = 12;

/** One word for how a member did in the past weeks, judged only on the weeks they were in the clan. */
export const reliability = (member: ClanWarMember): Reliability => {
  const weeks = member.decksUsedPastWeeks.filter((decks): decks is number => decks != null);
  const [latest, previous] = weeks;
  if (latest == null || previous == null) return 'new';
  if (weeks.every((decks) => decks >= DECKS_PER_WEEK)) return 'reliable';
  if (latest === 0 && previous === 0) return 'ghost';
  if (latest < SLIPPING_BELOW) return 'slipping';
  return 'steady';
};

const REMINDER_NAMES = 8;
const SITE = 'royaledecklab.com';

const nameList = (names: string[]): string =>
  names.length > REMINDER_NAMES
    ? `${names.slice(0, REMINDER_NAMES).join(', ')} +${names.length - REMINDER_NAMES} more`
    : names.join(', ');

/** A message to paste in clan chat naming who still has decks to play today. */
export const clanChatReminder = (war: ClanWar): string => {
  const groups = groupByToday(war.members);
  const byName = (a: ClanWarMember, b: ClanWarMember) => a.name.localeCompare(b.name);
  const lines = [`${dayLabel(war)}: ${war.decksLeftToday} ${war.decksLeftToday === 1 ? 'deck' : 'decks'} still open! 🚣`];
  if (groups.notStarted.length > 0) lines.push(`Not started: ${nameList([...groups.notStarted].sort(byName).map((m) => m.name))}`);
  if (groups.started.length > 0) {
    const started = [...groups.started].sort((a, b) => b.decksLeftToday - a.decksLeftToday || byName(a, b));
    lines.push(`Still to finish: ${nameList(started.map((m) => `${m.name} (${m.decksLeftToday})`))}`);
  }
  lines.push(`Your best war decks: ${SITE}`);
  return lines.join('\n');
};

/** A war-day boat crosses the finish at this much fame; colosseum weeks have no finish line. */
export const FINISH_FAME = 10_000;

export const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

export interface RaceStanding {
  ours: RaceClan;
  position: number;
  todayRank: number;
}

/** Where this clan's boat is among the race clans, and how it ranks on today's medals. */
export const raceStanding = (war: ClanWar): RaceStanding | null => {
  const position = war.race.findIndex((clan) => clan.tag === war.tag);
  const ours = war.race[position];
  if (!ours) return null;
  const todayRank = 1 + war.race.filter((clan) => clan.medalsToday > ours.medalsToday).length;
  return { ours, position: position + 1, todayRank };
};

/** How far along the river each boat is, 0 to 1. In a colosseum week the leader sets the scale. */
export const boatProgress = (war: ClanWar, clan: RaceClan): number => {
  const course = war.period === 'colosseum' ? Math.max(...war.race.map((c) => c.fame), 1) : FINISH_FAME;
  return Math.min(clan.fame / course, 1);
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "1d 19h 21m" while days remain, then "4h 05m 12s". */
export const countdownText = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}h ${pad(minutes)}m ${pad(total % 60)}s`;
};

export interface PodiumPlace {
  member: ClanWarMember;
  fame: number;
}

/** Last week's three members with the most fame, best first. */
export const lastWeekPodium = (war: ClanWar): PodiumPlace[] =>
  war.members
    .flatMap((member) => {
      const fame = member.famePastWeeks[0];
      return fame == null || fame === 0 ? [] : [{ member, fame }];
    })
    .sort((a, b) => b.fame - a.fame || a.member.name.localeCompare(b.member.name))
    .slice(0, 3);
