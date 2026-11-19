import { describe, expect, test } from 'bun:test';
import { cardDescription, topDeckSentence } from './topDeck';

const deck = (winRate: number, cards: [string, number][]) => ({
  winRate,
  cards: cards.map(([name, elixirCost]) => ({ name, elixirCost })),
});

const balloonCycle = deck(0.561, [
  ['Balloon', 5], ['Skeletons', 1], ['Musketeer', 4], ['Miner', 3],
  ['Ice Golem', 2], ['Bomb Tower', 4], ['Barbarian Barrel', 2], ['Giant Snowball', 2],
]);
const lavaLoon = deck(0.582, [
  ['Balloon', 5], ['Barbarians', 5], ['Baby Dragon', 4], ['Lava Hound', 7],
  ['Mega Minion', 3], ['Tombstone', 3], ['Fireball', 4], ['Zap', 2],
]);

describe('topDeckSentence', () => {
  test('names the first deck, its priciest other cards and its win rate', () => {
    expect(topDeckSentence('Balloon', [balloonCycle, lavaLoon])).toBe(
      'Best Balloon war deck right now: Balloon Cycle with Musketeer, Bomb Tower and Miner, 56.1% win rate in the top war clans.',
    );
  });

  test('has nothing to say without a ranked deck', () => {
    expect(topDeckSentence('Balloon', [])).toBeNull();
  });
});

describe('cardDescription', () => {
  test('leads with the top deck and counts the rest', () => {
    expect(cardDescription('Balloon', undefined, [balloonCycle, lavaLoon])).toBe(
      'Best Balloon war deck right now: Balloon Cycle with Musketeer, Bomb Tower and Miner, 56.1% win rate in the top war clans. Plus 1 more ranked war deck.',
    );
  });

  test('falls back to the card numbers without a ranked deck', () => {
    expect(cardDescription('Balloon', { winRate: 0.503, playRate: 0.072 }, [])).toBe(
      'The best Balloon decks for Clash Royale Clan War, ranked on real war battles: 50.3% win rate, 7.2% use rate and its change since the last balance update.',
    );
  });

  test('stays within the length Google shows', () => {
    const long = deck(0.5, [
      ['Mini P.E.K.K.A', 4], ['Elite Barbarians', 6], ['Elixir Collector', 6], ['Royal Recruits', 7],
      ['Goblin Giant', 6], ['Barbarian Barrel', 2], ['Giant Snowball', 2], ['Electro Spirit', 1],
    ]);
    expect(cardDescription('Mini P.E.K.K.A', undefined, [long, long, long]).length).toBeLessThanOrEqual(160);
  });
});
