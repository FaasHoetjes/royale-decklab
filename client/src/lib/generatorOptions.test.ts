import { describe, expect, test } from 'bun:test';
import { DEFAULT_OPTIONS, isPlannedAround, planRestOfToday } from './generatorOptions';

const deck = (from: number) => Array.from({ length: 8 }, (_, i) => from + i);

describe('planning the rest of today', () => {
  test('asks for the decks left and bans every card played today, keeping the player\'s own bans', () => {
    const plan = planRestOfToday({ ...DEFAULT_OPTIONS, ban: [99] }, 1, deck(1));

    expect(plan?.decks).toBe(3);
    expect(plan?.ban).toEqual([...deck(1), 99]);
  });

  test('drops required cards and locked decks that use a card played today', () => {
    const plan = planRestOfToday({ ...DEFAULT_OPTIONS, require: [3, 50], lock: [deck(5), deck(60)] }, 2, [...deck(1)]);

    expect(plan?.require).toEqual([50]);
    expect(plan?.lock).toEqual([deck(60)]);
  });

  test('keeps within the API limit of 40 banned cards, played cards first', () => {
    const ownBans = Array.from({ length: 30 }, (_, i) => 200 + i);
    const plan = planRestOfToday({ ...DEFAULT_OPTIONS, ban: ownBans }, 3, [...deck(1), ...deck(11), ...deck(21)]);

    expect(plan?.ban).toHaveLength(40);
    expect(plan?.ban.slice(0, 24)).toEqual([...deck(1), ...deck(11), ...deck(21)]);
  });

  test('has nothing to plan before the first deck or after the last', () => {
    expect(planRestOfToday(DEFAULT_OPTIONS, 0, [])).toBeNull();
    expect(planRestOfToday(DEFAULT_OPTIONS, 4, deck(1))).toBeNull();
  });

  test('knows when the options are already planned around today', () => {
    const plan = planRestOfToday(DEFAULT_OPTIONS, 1, deck(1));

    expect(plan && isPlannedAround(plan, 1, deck(1))).toBe(true);
    expect(isPlannedAround(DEFAULT_OPTIONS, 1, deck(1))).toBe(false);
  });
});
