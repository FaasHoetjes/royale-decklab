import { describe, expect, test } from 'bun:test';
import { LEAGUES, deckSizeOf, leagueFor } from './crownSeries';

describe('leagueFor', () => {
  test('the league in the link wins', () => {
    expect(leagueFor('hammer')).toMatchObject({ id: 'hammer', levelCap: 13 });
  });

  test("an unknown league falls back to King's", () => {
    expect(leagueFor('gold').id).toBe('kings');
  });
});

describe('deckSizeOf', () => {
  test.each([
    ['3', 3],
    ['4', 4],
    [null, 4],
    ['5', 4],
  ])('%p decks is %p', (value, size) => {
    expect(deckSizeOf(value)).toBe(size);
  });
});

test('league caps only rise', () => {
  const caps = LEAGUES.map((league) => league.levelCap);
  expect(caps).toEqual([...caps].sort((a, b) => a - b));
});
