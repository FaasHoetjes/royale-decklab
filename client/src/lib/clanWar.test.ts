import { describe, expect, test } from 'bun:test';
import type { ClanWar, ClanWarMember } from '../api';
import {
  boatProgress,
  clanChatReminder,
  countdownText,
  lastWeekPodium,
  ordinal,
  raceStanding,
  dayLabel,
  decksAvailableThisWeek,
  groupByToday,
  lastWeekTurnout,
  pastWeekBars,
  reliability,
  roleLabel,
} from './clanWar';

const member = (decksUsedPastWeeks: (number | null)[]): ClanWarMember => ({
  tag: '#A',
  name: 'Anna',
  role: 'member',
  lastSeen: null,
  decksUsedToday: 0,
  decksLeftToday: 0,
  decksUsedThisWeek: 0,
  fame: 0,
  decksUsedPastWeeks,
  famePastWeeks: decksUsedPastWeeks.map((decks) => (decks == null ? null : decks * 200)),
});

const war = (overrides: Partial<ClanWar>): ClanWar => ({
  tag: '#CLAN',
  name: 'Example',
  period: 'training',
  day: 1,
  isBattleDay: false,
  decksLeftToday: 0,
  membersDoneToday: 0,
  members: [],
  pastWeeks: [
    { seasonId: 137, week: 4, rank: 2, fame: 30_000, endedAt: null },
    { seasonId: 137, week: 3, rank: 4, fame: 25_000, endedAt: null },
  ],
  leaversWithDecks: 0,
  race: [],
  dayEndsAt: null,
  warStartsAt: null,
  ...overrides,
});

describe('clan war', () => {
  test('names the day within its period', () => {
    expect(dayLabel(war({ period: 'training', day: 2 }))).toBe('Training day 2 of 3');
    expect(dayLabel(war({ period: 'warDay', day: 4, isBattleDay: true }))).toBe('War day 4 of 4');
    expect(dayLabel(war({ period: 'colosseum', day: 1, isBattleDay: true }))).toBe('Colosseum day 1 of 4');
  });

  test('counts the decks a member could have played so far, none before the war starts', () => {
    expect(decksAvailableThisWeek(war({ period: 'warDay', day: 3, isBattleDay: true }))).toBe(12);
    expect(decksAvailableThisWeek(war({ period: 'training', day: 3 }))).toBe(0);
  });

  test('past week bars read oldest first, keeping weeks outside the clan empty', () => {
    const bars = pastWeekBars(war({}), member([16, null]));

    expect(bars.map((b) => [b.label, b.decks])).toEqual([
      ['Week 3', null],
      ['Week 4', 16],
    ]);
  });

  test("last week's turnout leaves out members who weren't in the clan yet", () => {
    const turnout = lastWeekTurnout(war({ members: [member([16, 16]), member([9, 16]), member([null, null])] }));

    expect(turnout).toEqual({ playedAll: 1, missedSome: 1 });
  });

  test('a clan without war history has no turnout', () => {
    expect(lastWeekTurnout(war({ pastWeeks: [] }))).toBeNull();
  });

  test('plain members get no role badge', () => {
    expect(roleLabel('coLeader')).toBe('Co-leader');
    expect(roleLabel('member')).toBeNull();
  });
});

const playing = (name: string, decksUsedToday: number): ClanWarMember => ({
  ...member([]),
  tag: `#${name}`,
  name,
  decksUsedToday,
  decksLeftToday: 4 - decksUsedToday,
});

describe('clan war today', () => {
  test('groups members by how far they got today', () => {
    const groups = groupByToday([playing('Anna', 0), playing('Bram', 2), playing('Cas', 4)]);

    expect(groups.notStarted.map((m) => m.name)).toEqual(['Anna']);
    expect(groups.started.map((m) => m.name)).toEqual(['Bram']);
    expect(groups.done.map((m) => m.name)).toEqual(['Cas']);
  });

  test('the clan chat reminder names who has not started and who still has decks, most decks first', () => {
    const members = [playing('Zoe', 0), playing('Anna', 0), playing('Bram', 3), playing('Cas', 1), playing('Dirk', 4)];
    const text = clanChatReminder(war({ period: 'warDay', day: 2, isBattleDay: true, decksLeftToday: 12, members }));

    expect(text).toBe(
      [
        'War day 2 of 4: 12 decks still open! 🚣',
        'Not started: Anna, Zoe',
        'Still to finish: Cas (3), Bram (1)',
        'Your best war decks: royaledecklab.com',
      ].join('\n')
    );
  });

  test('the reminder shortens a long list of names', () => {
    const members = Array.from({ length: 10 }, (_, i) => playing(`P${i}`, 0));
    const text = clanChatReminder(war({ period: 'warDay', day: 1, isBattleDay: true, decksLeftToday: 40, members }));

    expect(text).toContain('P7 +2 more');
  });
});

describe('reliability', () => {
  test('is new with fewer than two weeks in the clan', () => {
    expect(reliability(member([16, null, null]))).toBe('new');
  });

  test('is reliable when every week was played in full', () => {
    expect(reliability(member([16, 16, null, 16]))).toBe('reliable');
  });

  test('is a ghost after two empty weeks', () => {
    expect(reliability(member([0, 0, 16, 16]))).toBe('ghost');
  });

  test('is slipping when last week fell short, steady otherwise', () => {
    expect(reliability(member([8, 16, 16]))).toBe('slipping');
    expect(reliability(member([14, 16, 12]))).toBe('steady');
  });
});

describe('river race', () => {
  const race = [
    { tag: '#CLAN', name: 'Example', fame: 3_435, medalsToday: 9_950 },
    { tag: '#B', name: 'B', fame: 2_212, medalsToday: 16_000 },
    { tag: '#C', name: 'C', fame: 1_035, medalsToday: 22_950 },
  ];

  test("finds the boat position and the rank on today's medals", () => {
    const standing = raceStanding(war({ period: 'warDay', isBattleDay: true, race }));

    expect(standing?.position).toBe(1);
    expect(standing?.todayRank).toBe(3);
  });

  test('has no standing when the clan is missing from the race', () => {
    expect(raceStanding(war({ race: [] }))).toBeNull();
  });

  test('boats sail toward 10,000 fame on war days and toward the leader in the colosseum', () => {
    expect(boatProgress(war({ period: 'warDay', race }), race[0]!)).toBeCloseTo(0.3435);
    expect(boatProgress(war({ period: 'colosseum', race }), race[1]!)).toBeCloseTo(2_212 / 3_435);
    expect(boatProgress(war({ period: 'warDay', race }), { ...race[0]!, fame: 12_000 })).toBe(1);
  });

  test('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st',
    ]);
  });

  test('the countdown drops seconds while days remain', () => {
    expect(countdownText(((1 * 24 + 19) * 60 + 21) * 60_000 + 14_000)).toBe('1d 19h 21m');
    expect(countdownText((4 * 60 + 5) * 60_000 + 12_000)).toBe('4h 05m 12s');
    expect(countdownText(-5_000)).toBe('0h 00m 00s');
  });

  test("last week's podium is the top three on fame, leaving out who wasn't there or scored nothing", () => {
    const withFame = (name: string, fame: number | null) => ({ ...member([]), tag: `#${name}`, name, famePastWeeks: [fame] });
    const podium = lastWeekPodium(
      war({ members: [withFame('A', 1_200), withFame('B', 3_000), withFame('C', null), withFame('D', 0), withFame('E', 2_000), withFame('F', 900)] })
    );

    expect(podium.map((p) => p.member.name)).toEqual(['B', 'E', 'A']);
  });
});
