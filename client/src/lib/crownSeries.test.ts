import { describe, expect, test } from 'bun:test';
import { LEAGUES, leagueFor, upgradeTargets } from './crownSeries';

describe('leagueFor', () => {
  test('the league in the link wins', () => {
    expect(leagueFor('hammer')).toMatchObject({ id: 'hammer', levelCap: 13 });
  });

  test("an unknown league falls back to King's", () => {
    expect(leagueFor('gold').id).toBe('kings');
  });
});

test('league caps only rise', () => {
  const caps = LEAGUES.map((league) => league.levelCap);
  expect(caps).toEqual([...caps].sort((a, b) => a - b));
});

describe('upgradeTargets', () => {
  const card = (id: number, level: number) => ({ id, name: `Card ${id}`, level, maxLevel: 16 });

  test('keeps only cards below the cap, the furthest below first', () => {
    const decks = [{ cards: [card(1, 15), card(2, 16), card(3, 13)] }, { cards: [card(4, 14)] }];
    expect(upgradeTargets(decks, 16).map((t) => [t.id, t.level, t.deckNumbers])).toEqual([
      [3, 13, [1]],
      [4, 14, [2]],
      [1, 15, [1]],
    ]);
  });

  test('a card in several decks counts once and ranks above one in a single deck', () => {
    const decks = [{ cards: [card(1, 14), card(2, 14)] }, { cards: [card(2, 14)] }];
    expect(upgradeTargets(decks, 16).map((t) => [t.id, t.deckNumbers])).toEqual([
      [2, [1, 2]],
      [1, [1]],
    ]);
  });

  test('levels are compared on the 16-level scale', () => {
    expect(upgradeTargets([{ cards: [{ id: 1, name: 'Epic', level: 11, maxLevel: 11 }] }], 16)).toEqual([]);
  });
});
