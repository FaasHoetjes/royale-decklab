import type { CardStat } from '../api';

export const CARD_SORTS = ['Win rate', 'Play rate', 'Change'] as const;
export type CardSort = (typeof CARD_SORTS)[number];

// Card win rates in war spread about 1.9 points around 50% (one standard deviation, measured over 226k battles in Oct 2026).
// A win rate is reliable enough to rank once at least 70% of what it shows is that real spread rather than chance, the
// stricter of the sabermetric stabilization points: chance (two standard errors) can then move it by at most 2.6 points.
// Taken at a 50% win rate, where chance moves it most, so a 3-0 record can't look reliable.
const MAX_WIN_RATE_MARGIN = 0.026;
const MIN_RELIABLE_GAMES = Math.ceil(1 / MAX_WIN_RATE_MARGIN ** 2);

/** Rarely played cards have unreliable win rates, so they rank last and greyed out. */
export function isLowSample(stat: CardStat): boolean {
  return stat.games < MIN_RELIABLE_GAMES;
}

function sortValue(stat: CardStat, sort: CardSort): number | null {
  if (sort === 'Play rate') return stat.playRate;
  if (sort === 'Change') return stat.winRateChange;
  return stat.winRate;
}

/** Highest first, with rarely played cards and cards without a value last; `descending: false` flips the rest. */
export function sortCardStats<T extends { stat: CardStat }>(cards: T[], sort: CardSort, descending = true): T[] {
  const sign = descending ? -1 : 1;
  return [...cards].sort((a, b) => {
    const x = sortValue(a.stat, sort);
    const y = sortValue(b.stat, sort);
    return (
      Number(isLowSample(a.stat)) - Number(isLowSample(b.stat)) ||
      Number(x == null) - Number(y == null) ||
      sign * ((x ?? 0) - (y ?? 0))
    );
  });
}

/** Each card's place by play rate among all cards, and by win rate among the cards with enough games. */
export function cardRanks(stats: CardStat[]) {
  const byPlay = [...stats].sort((a, b) => b.playRate - a.playRate);
  const ranked = stats.filter((s) => !isLowSample(s)).sort((a, b) => b.winRate - a.winRate);
  return {
    playRank: new Map(byPlay.map((s, i) => [s.id, i + 1])),
    winRank: new Map(ranked.map((s, i) => [s.id, i + 1])),
    rankedCount: ranked.length,
  };
}

export const percent = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;
