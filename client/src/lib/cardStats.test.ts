import { describe, expect, test } from 'bun:test';
import type { CardStat } from '../api';
import { cardRanks, isLowSample, sortCardStats } from './cardStats';

const BATTLES = 200_000;

function stat(id: number, winRate: number, games: number, winRateChange: number | null = null): CardStat {
  return {
    id,
    games,
    winRate,
    playRate: games / BATTLES,
    evoShare: 0,
    heroShare: 0,
    previousGames: 0,
    previousWinRate: null,
    previousPlayRate: null,
    winRateChange,
    changeMargin: null,
    changeIsClear: false,
  };
}

const ids = (cards: Array<{ stat: CardStat }>) => cards.map((c) => c.stat.id);

describe('isLowSample', () => {
  test('needs 1% of the battles, and at least 500 games', () => {
    expect(isLowSample(stat(1, 0.5, 1_999), BATTLES)).toBe(true);
    expect(isLowSample(stat(1, 0.5, 2_000), BATTLES)).toBe(false);
    expect(isLowSample(stat(1, 0.5, 499), 10_000)).toBe(true);
  });
});

describe('sortCardStats', () => {
  const cards = [stat(1, 0.5, 10_000, -0.01), stat(2, 0.7, 300, 0.05), stat(3, 0.55, 5_000, null), stat(4, 0.52, 20_000, 0.02)].map(
    (s) => ({ stat: s })
  );

  test('ranks by win rate with rarely played cards last', () => {
    expect(ids(sortCardStats(cards, 'Win rate', BATTLES))).toEqual([3, 4, 1, 2]);
  });

  test('ranks by play rate', () => {
    expect(ids(sortCardStats(cards, 'Play rate', BATTLES))).toEqual([4, 1, 3, 2]);
  });

  test('ranks by change, with cards that have none after those that do', () => {
    expect(ids(sortCardStats(cards, 'Change', BATTLES))).toEqual([4, 1, 3, 2]);
  });

  test('ascending flips the order but keeps rarely played cards and missing changes last', () => {
    expect(ids(sortCardStats(cards, 'Win rate', BATTLES, false))).toEqual([1, 4, 3, 2]);
    expect(ids(sortCardStats(cards, 'Change', BATTLES, false))).toEqual([1, 4, 3, 2]);
  });
});

describe('cardRanks', () => {
  test('ranks play rate over every card and win rate over the cards with enough games', () => {
    const { playRank, winRank, rankedCount } = cardRanks([stat(1, 0.5, 10_000), stat(2, 0.7, 300), stat(3, 0.55, 5_000)], BATTLES);
    expect([playRank.get(1), playRank.get(3), playRank.get(2)]).toEqual([1, 2, 3]);
    expect([winRank.get(3), winRank.get(1), winRank.get(2)]).toEqual([1, 2, undefined]);
    expect(rankedCount).toBe(2);
  });
});
