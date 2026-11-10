import type { ClanRole, ClanWar, ClanWarMember, PastWarWeek, RaceClan } from '../api';

export const DECKS_PER_DAY = 4;
export const DECKS_PER_WEEK = 16;
const TRAINING_DAYS = 3;
const BATTLE_DAYS = 4;

export const dayLabel = (war: ClanWar): string => {
  if (war.period === 'training') return `Training day ${war.day} of ${TRAINING_DAYS}`;
  if (war.period === 'colosseum') return `Colosseum day ${war.day} of ${BATTLE_DAYS}`;
  if (war.period === 'notRacing') return 'Not in a river race';
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
  /** Counted back from now, so the order never jumbles where one season ends and the next begins. */
  label: string;
  shortLabel: string;
  /** Null when the member wasn't in the clan that week. */
  decks: number | null;
  medals: number | null;
}

/** The API lists past weeks newest first; bars read left to right, oldest first. */
export const pastWeekBars = (war: ClanWar, member: ClanWarMember): WeekBar[] =>
  war.pastWeeks
    .map((week, i) => ({
      key: `${week.seasonId}-${week.week}`,
      label: i === 0 ? 'Last week' : `${i + 1} weeks ago`,
      shortLabel: i === 0 ? 'Last' : `${i + 1}w ago`,
      decks: member.decksUsedPastWeeks[i] ?? null,
      medals: member.decksUsedPastWeeks[i] == null ? null : (member.famePastWeeks[i] ?? 0),
    }))
    .reverse();

export type TodayStatus = 'notStarted' | 'started' | 'done';

export const TODAY_STATUSES: TodayStatus[] = ['notStarted', 'started', 'done'];

export const todayStatusLabel: Record<TodayStatus, string> = {
  notStarted: 'Not started',
  started: 'Started',
  done: 'Done',
};

const todayStatus = (member: ClanWarMember): TodayStatus => {
  if (member.decksLeftToday === 0) return 'done';
  return member.decksUsedToday > 0 ? 'started' : 'notStarted';
};

export const groupByToday = (members: ClanWarMember[]): Record<TodayStatus, ClanWarMember[]> => {
  const groups: Record<TodayStatus, ClanWarMember[]> = { notStarted: [], started: [], done: [] };
  members.forEach((member) => groups[todayStatus(member)].push(member));
  return groups;
};

export type Reliability = 'reliable' | 'steady' | 'slipping' | 'ghost' | 'new';

export const reliabilityLabel: Record<Reliability, string> = {
  reliable: 'Reliable',
  steady: 'Steady',
  slipping: 'Slipping',
  ghost: 'Ghost',
  new: 'New',
};

const SLIPPING_BELOW = 12;

export const reliabilityMeaning: Record<Reliability, string> = {
  reliable: `Played all ${DECKS_PER_WEEK} decks every week`,
  steady: 'Plays most of their decks',
  slipping: `Played under ${SLIPPING_BELOW} decks last week`,
  ghost: 'No decks in the last two weeks',
  new: 'Not two weeks in the clan yet',
};


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

export type ReminderStyle = 'short' | 'names' | 'full';
export const REMINDER_STYLES: ReminderStyle[] = ['short', 'names', 'full'];
export const reminderStyleLabel: Record<ReminderStyle, string> = { short: 'Short', names: 'With names', full: 'Full list' };

const NAMES_SHOWN = 5;
const SITE = 'royaledecklab.com';

const byName = (a: ClanWarMember, b: ClanWarMember) => a.name.localeCompare(b.name);
const decksWord = (n: number) => (n === 1 ? 'deck' : 'decks');
const clanLink = (war: ClanWar) => `${SITE}/clan/${war.tag.replace('#', '')}`;

const shortList = (names: string[]): string =>
  names.length > NAMES_SHOWN ? `${names.slice(0, NAMES_SHOWN).join(', ')} +${names.length - NAMES_SHOWN}` : names.join(', ');

/** A message to paste in clan chat about who still has decks to play today, from a one-liner to everyone named. */
export const clanChatReminder = (war: ClanWar, style: ReminderStyle): string => {
  const groups = groupByToday(war.members);
  const notStarted = [...groups.notStarted].sort(byName).map((m) => m.name);
  const started = [...groups.started].sort((a, b) => b.decksLeftToday - a.decksLeftToday || byName(a, b));
  const open = `${war.decksLeftToday} ${decksWord(war.decksLeftToday)} still open`;

  if (style === 'full') {
    const blocks = [`🚣 ${dayLabel(war)} · ${open}`];
    if (notStarted.length > 0) blocks.push(`Not played yet (${notStarted.length})\n${notStarted.join(', ')}`);
    if (started.length > 0) blocks.push(`Decks left to finish\n${started.map((m) => `${m.name} ${m.decksLeftToday}`).join(' · ')}`);
    blocks.push(clanLink(war));
    return blocks.join('\n\n');
  }

  const lines = [`${dayLabel(war)}: ${open} 🚣`];
  if (style === 'names') {
    if (notStarted.length > 0) lines.push(`Not played yet: ${shortList(notStarted)}`);
    else lines.push(`Still to finish: ${shortList(started.map((m) => m.name))}`);
    lines.push(`Everyone's status: ${clanLink(war)}`);
    return lines.join('\n');
  }

  const counts = [
    notStarted.length > 0 && `${notStarted.length} ${notStarted.length === 1 ? "hasn't" : "haven't"} played yet`,
    started.length > 0 && `${started.length} ${started.length === 1 ? 'is' : 'are'} halfway`,
  ].filter(Boolean);
  if (counts.length > 0) lines.push(`${counts.join(', ')}.`);
  lines.push(`Check yours: ${clanLink(war)}`);
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
