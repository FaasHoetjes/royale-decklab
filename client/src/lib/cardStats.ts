import type { CardStat } from '../api';

export const CARD_SORTS = ['Win rate', 'Play rate', 'Change'] as const;
export type CardSort = (typeof CARD_SORTS)[number];

/** Rarely played cards get rough win rates (a 1% play rate over 220k battles is still 2,200 games), so they rank last and greyed out. */
export function isLowSample(stat: CardStat, battles: number): boolean {
  return stat.games < Math.max(500, battles * 0.01);
}

function sortValue(stat: CardStat, sort: CardSort): number | null {
  if (sort === 'Play rate') return stat.playRate;
  if (sort === 'Change') return stat.winRateChange;
  return stat.winRate;
}

/** Highest first, with rarely played cards and cards without a value last; `descending: false` flips the rest. */
export function sortCardStats<T extends { stat: CardStat }>(cards: T[], sort: CardSort, battles: number, descending = true): T[] {
  const sign = descending ? -1 : 1;
  return [...cards].sort((a, b) => {
    const x = sortValue(a.stat, sort);
    const y = sortValue(b.stat, sort);
    return (
      Number(isLowSample(a.stat, battles)) - Number(isLowSample(b.stat, battles)) ||
      Number(x == null) - Number(y == null) ||
      sign * ((x ?? 0) - (y ?? 0))
    );
  });
}

/** Each card's place by play rate among all cards, and by win rate among the cards with enough games. */
export function cardRanks(stats: CardStat[], battles: number) {
  const byPlay = [...stats].sort((a, b) => b.playRate - a.playRate);
  const ranked = stats.filter((s) => !isLowSample(s, battles)).sort((a, b) => b.winRate - a.winRate);
  return {
    playRank: new Map(byPlay.map((s, i) => [s.id, i + 1])),
    winRank: new Map(ranked.map((s, i) => [s.id, i + 1])),
    rankedCount: ranked.length,
  };
}

export const percent = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;
