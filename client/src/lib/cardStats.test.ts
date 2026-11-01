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
  test('needs enough games that chance moves a 50% win rate by at most 2.6 points', () => {
    expect(isLowSample(stat(1, 0.5, 1_479))).toBe(true);
    expect(isLowSample(stat(1, 0.5, 1_480))).toBe(false);
  });

  test('a perfect record on a few games is still unreliable', () => {
    expect(isLowSample(stat(1, 1, 3))).toBe(true);
  });
});

describe('sortCardStats', () => {
  const cards = [stat(1, 0.5, 10_000, -0.01), stat(2, 0.7, 300, 0.05), stat(3, 0.55, 5_000, null), stat(4, 0.52, 20_000, 0.02)].map(
    (s) => ({ stat: s })
  );

  test('ranks by win rate with rarely played cards last', () => {
    expect(ids(sortCardStats(cards, 'Win rate'))).toEqual([3, 4, 1, 2]);
  });

  test('ranks by play rate', () => {
    expect(ids(sortCardStats(cards, 'Play rate'))).toEqual([4, 1, 3, 2]);
  });

  test('ranks by change, with cards that have none after those that do', () => {
    expect(ids(sortCardStats(cards, 'Change'))).toEqual([4, 1, 3, 2]);
  });

  test('ascending flips the order but keeps rarely played cards and missing changes last', () => {
    expect(ids(sortCardStats(cards, 'Win rate', false))).toEqual([1, 4, 3, 2]);
    expect(ids(sortCardStats(cards, 'Change', false))).toEqual([1, 4, 3, 2]);
  });
});

describe('cardRanks', () => {
  test('ranks play rate over every card and win rate over the cards with enough games', () => {
    const { playRank, winRank, rankedCount } = cardRanks([stat(1, 0.5, 10_000), stat(2, 0.7, 300), stat(3, 0.55, 5_000)]);
    expect([playRank.get(1), playRank.get(3), playRank.get(2)]).toEqual([1, 2, 3]);
    expect([winRank.get(3), winRank.get(1), winRank.get(2)]).toEqual([1, 2, undefined]);
    expect(rankedCount).toBe(2);
  });
});
