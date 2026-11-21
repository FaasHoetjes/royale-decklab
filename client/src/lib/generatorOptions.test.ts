import { describe, expect, test } from 'bun:test';
import { DEFAULT_OPTIONS, hasActiveOptions, isPlannedAround, parseOptions, planRestOfToday, saveDefaults, toQuery } from './generatorOptions';

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

describe('season boosts option', () => {
  test('is on by default and leaves the query alone', () => {
    const options = parseOptions(new URLSearchParams(''));

    expect(options.boosts).toBe(true);
    expect(toQuery(options)).toBe('');
    expect(hasActiveOptions(options)).toBe(false);
  });

  test('turned off, it travels in the query and counts as an option to reset', () => {
    const options = parseOptions(new URLSearchParams('boosts=false'));

    expect(options.boosts).toBe(false);
    expect(toQuery(options)).toBe('boosts=false');
    expect(hasActiveOptions(options)).toBe(true);
  });

  test('turned off, it is not carried over to the next search like the deck count is', () => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;

    saveDefaults({ ...DEFAULT_OPTIONS, decks: 2, boosts: false });
    const next = parseOptions(new URLSearchParams(''));

    expect(next.decks).toBe(2);
    expect(next.boosts).toBe(true);
  });
});

describe('included card versions', () => {
  const parse = (query: string) => parseOptions(new URLSearchParams(query), { decks: 4, minLevel: null });

  test('read from the link and written back the same way', () => {
    const options = parse('require=26000008:evo,26000001,26000003:normal');

    expect(options.require).toEqual([26000008, 26000001, 26000003]);
    expect(options.requireAs).toEqual({ 26000008: 'evo', 26000003: 'normal' });
    expect(toQuery(options)).toBe('require=26000008:evo,26000001,26000003:normal');
  });

  test('an unknown version counts as best, and a banned card keeps none', () => {
    const options = parse('ban=5&require=5:evo,6:gold');

    expect(options.require).toEqual([6]);
    expect(options.requireAs).toEqual({});
  });

  test('a card played today loses its version with its place in the list', () => {
    const plan = planRestOfToday({ ...DEFAULT_OPTIONS, require: [3, 50], requireAs: { 3: 'evo', 50: 'hero' } }, 1, [3]);

    expect(plan?.requireAs).toEqual({ 50: 'hero' });
  });
});
