import { describe, expect, test } from 'bun:test';
import type { CardStat, CardStatsResponse } from '../api';
import { PATCH_MOVER_COUNT, patchMonth, patchName, playRateMovers, updateDate, winRateMovers } from './patchMovers';

function stat(id: number, change: { winRate?: [number, number]; playRate?: [number, number]; clear?: boolean; compared?: boolean }): CardStat {
  const [winBefore, winNow] = change.winRate ?? [0.5, 0.5];
  const [playBefore, playNow] = change.playRate ?? [0.05, 0.05];
  const compared = change.compared ?? true;
  return {
    id,
    games: 5000,
    winRate: winNow,
    playRate: playNow,
    evoShare: 0,
    heroShare: 0,
    previousGames: compared ? 5000 : 40,
    previousWinRate: winBefore,
    previousPlayRate: playBefore,
    winRateChange: compared ? winNow - winBefore : null,
    changeMargin: compared ? 0.02 : null,
    changeIsClear: change.clear ?? false,
  };
}

const ids = (movers: { stat: CardStat }[]) => movers.map((m) => m.stat.id);

describe('winRateMovers', () => {
  test('ranks clear changes by size, falls before rises when bigger', () => {
    const movers = winRateMovers([
      stat(1, { winRate: [0.5, 0.52], clear: true }),
      stat(2, { winRate: [0.5, 0.42], clear: true }),
      stat(3, { winRate: [0.5, 0.53], clear: true }),
    ]);
    expect(ids(movers)).toEqual([2, 3, 1]);
    expect(movers[0]).toMatchObject({ from: 0.5, to: 0.42 });
    expect(movers[0].change).toBeCloseTo(-0.08);
  });

  test('leaves out changes chance could explain', () => {
    expect(ids(winRateMovers([stat(1, { winRate: [0.5, 0.6], clear: false })]))).toEqual([]);
  });
});

describe('playRateMovers', () => {
  test('ranks by the change in use rate and skips cards too rare to compare', () => {
    const movers = playRateMovers([
      stat(1, { playRate: [0.05, 0.06] }),
      stat(2, { playRate: [0.09, 0.07] }),
      stat(3, { playRate: [0.01, 0.2], compared: false }),
    ]);
    expect(ids(movers)).toEqual([2, 1]);
  });

  test(`keeps the ${PATCH_MOVER_COUNT} biggest`, () => {
    const many = Array.from({ length: 20 }, (_, i) => stat(i, { playRate: [0.05, 0.05 + i / 1000] }));
    expect(ids(playRateMovers(many))).toEqual(Array.from({ length: PATCH_MOVER_COUNT }, (_, i) => 19 - i));
  });
});

describe('patchMonth', () => {
  const response = (since: string | null, until: string | null, isLastPatch: boolean): CardStatsResponse =>
    ({ since, until, isLastPatch, battles: 0, cards: [], previousSince: null });

  test('names the month this patch went live', () => {
    expect(patchMonth(response('2026-11-02T09:32:46.298Z', null, false))).toBe('November');
  });

  test("while only last patch's numbers are in, names the new patch", () => {
    expect(patchMonth(response('2026-10-05T09:00:00.000Z', '2026-11-02T09:32:46.298Z', true))).toBe('November');
  });

  test('has no month without a patch boundary', () => {
    expect(patchMonth(response(null, null, false))).toBeNull();
  });
});

describe('patchName', () => {
  const stats: CardStatsResponse = { since: '2026-11-02T09:32:46.298Z', until: null, isLastPatch: false, battles: 0, cards: [], previousSince: '2026-10-05T09:00:00.000Z' };
  const update = (liveFrom: string) => ({ liveFrom, notesUrl: 'https://supercell.com/x', changes: [] });

  test('names the month of the newest balance update shown', () => {
    expect(patchName(stats, [update('2026-10-06'), update('2026-10-19')])).toBe('October');
  });

  test('without an update, names the month the patch began', () => {
    expect(patchName(stats, [])).toBe('November');
  });
});

test('updateDate shows the day an update went live', () => {
  expect(updateDate('2026-10-19')).toBe('Oct 19');
});
