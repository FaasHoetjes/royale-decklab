import { describe, expect, test } from 'bun:test';
import { alignToReference, orderBySlots, type CardVersion } from './cardDisplay';

const deck = (...ids: number[]) => ids.map((id) => ({ id }));
const versions = (map: Record<number, CardVersion>) => (id: number): CardVersion => map[id] ?? 'normal';
const ids = (cards: Array<{ id: number }>) => cards.map((c) => c.id);

describe('alignToReference', () => {
  test('keeps shared cards where they were and puts the new card in the freed slot', () => {
    const v = versions({ 1: 'evo', 2: 'hero' });
    const reference = orderBySlots(deck(1, 2, 3, 4, 5, 6, 7, 8), v);
    const option = deck(8, 7, 6, 5, 4, 3, 2, 9);
    expect(ids(alignToReference(option, v, reference))).toEqual([9, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('a card that becomes a Hero stays put when its slot allows a Hero', () => {
    const before = versions({ 1: 'evo', 2: 'hero' });
    const reference = orderBySlots(deck(1, 2, 3, 4, 5, 6, 7, 8), before);
    const after = versions({ 1: 'evo', 3: 'hero' });
    expect(ids(alignToReference(deck(1, 2, 3, 4, 5, 6, 7, 9), after, reference))).toEqual([1, 2, 3, 4, 5, 6, 7, 9]);
  });

  test('a card that becomes a Hero moves into a Hero slot when it was further back', () => {
    const before = versions({ 1: 'evo', 2: 'hero' });
    const reference = orderBySlots(deck(1, 2, 3, 4, 5, 6, 7, 8), before);
    const after = versions({ 1: 'evo', 5: 'hero' });
    expect(ids(alignToReference(deck(1, 2, 3, 4, 5, 6, 7, 9), after, reference))).toEqual([1, 5, 3, 4, 2, 6, 7, 9]);
  });

  test('a second evo may take slot 3 to stay in place', () => {
    const v = versions({ 1: 'evo', 3: 'evo' });
    const reference = deck(1, 4, 3, 5, 6, 7, 8, 2);
    expect(ids(alignToReference(deck(3, 1, 4, 5, 6, 7, 8, 9), v, reference))).toEqual([1, 4, 3, 5, 6, 7, 8, 9]);
  });

  test('never moves an Evolution or Hero out of its slots', () => {
    const v = versions({ 9: 'hero' });
    const reference = deck(1, 2, 3, 4, 5, 6, 7, 9);
    const aligned = ids(alignToReference(deck(1, 2, 3, 4, 5, 6, 7, 9), v, reference));
    expect([1, 2]).toContain(aligned.indexOf(9));
  });
});
