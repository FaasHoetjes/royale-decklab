import { describe, expect, test } from 'bun:test';
import type { BuilderCard } from './builderCards';
import { displayLevel } from './cardDisplay';
import { listNames, withSeasonBoosts } from './seasonBoosts';

const card = (id: number, level: number | undefined, maxLevel: number, owned = true): BuilderCard => ({
  id,
  name: `Card ${id}`,
  elixirCost: 3,
  rarity: 'common',
  owned,
  level,
  maxLevel,
  isHero: false,
  hasEvo: false,
  ownsHero: false,
  iconUrls: {},
});

describe('season boosts on the picker cards', () => {
  test('lift boosted cards to the boost level whatever their rarity cap, and leave the rest', () => {
    const cards = [card(1, 10, 16), card(2, 3, 8), card(3, 12, 16)];

    const lifted = withSeasonBoosts(cards, { level: 15, cardIds: [1, 2] });

    expect(lifted.map((c) => displayLevel(c.level ?? 0, c.maxLevel ?? 16))).toEqual([15, 15, 12]);
    expect(lifted.map((c) => !!c.isBoosted)).toEqual([true, true, false]);
    expect(lifted[2]).toBe(cards[2]);
  });

  test('never lend a level to a card the player doesn\'t own', () => {
    const cards = [card(1, undefined, 16, false)];

    expect(withSeasonBoosts(cards, { level: 15, cardIds: [1] })[0]).toBe(cards[0]);
  });
});

describe('listing card names', () => {
  test('joins the last name with "and"', () => {
    expect(listNames(['Giant'])).toBe('Giant');
    expect(listNames(['Giant', 'Mortar'])).toBe('Giant and Mortar');
    expect(listNames(['Giant', 'Mortar', 'Mirror'])).toBe('Giant, Mortar and Mirror');
  });
});
