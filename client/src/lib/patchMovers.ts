import type { BalanceUpdate, CardStat, CardStatsResponse } from '../api';
import { shortDate } from './statsPeriod';

export const PATCH_MOVER_COUNT = 12;

/** The start page's patch section, which /patch opens at. */
export const PATCH_SECTION_ID = 'patch';

export interface Mover {
  stat: CardStat;
  from: number;
  to: number;
  change: number;
}

// The server only sets a change once both patches have enough games for it.
const compared = (stats: CardStat[]) => stats.filter((s) => s.winRateChange != null);

const biggestFirst = (movers: Mover[]) =>
  [...movers].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, PATCH_MOVER_COUNT);

/** The cards whose share of war decks moved the most since last patch. */
export const playRateMovers = (stats: CardStat[]): Mover[] =>
  biggestFirst(
    compared(stats).map((stat) => {
      const from = stat.previousPlayRate ?? stat.playRate;
      return { stat, from, to: stat.playRate, change: stat.playRate - from };
    })
  );

/** The cards whose war win rate moved the most since last patch, leaving out changes chance could explain. */
export const winRateMovers = (stats: CardStat[]): Mover[] =>
  biggestFirst(
    compared(stats)
      .filter((stat) => stat.changeIsClear)
      .map((stat) => {
        const from = stat.previousWinRate ?? stat.winRate;
        return { stat, from, to: stat.winRate, change: stat.winRate - from };
      })
  );

/** When this patch went live. While only last patch's numbers are in, the new patch began where they end. */
export const patchStart = (stats: CardStatsResponse): string | null => (stats.isLastPatch ? stats.until : stats.since);

/** "November", for the patch that went live in November; matches SpaContent.PatchHeading on the server. */
export const patchMonth = (stats: CardStatsResponse): string | null => {
  const start = patchStart(stats);
  if (!start) return null;
  return new Date(start).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
};

/**
 * "October", for a patch whose newest balance update went live in October, as that's whose notes it links to.
 * Without an update, the month the patch began. Matches SpaContent.PatchHeading on the server.
 */
export const patchName = (stats: CardStatsResponse, updates: BalanceUpdate[]): string | null => {
  const newest = updates.map((u) => u.liveFrom).sort().at(-1);
  if (newest) return new Date(`${newest}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return patchMonth(stats);
};

export const updateDate = (liveFrom: string): string => shortDate(`${liveFrom}T00:00:00Z`);
