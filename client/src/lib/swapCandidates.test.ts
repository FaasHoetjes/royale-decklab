import { describe, expect, test } from 'bun:test';
import { swapCandidates } from './swapCandidates';

const deck = (start: number, playerScore: number) => ({ cardIds: [start, start + 1], playerScore });

describe('swapCandidates', () => {
  // Generated: 0 = cards 1-2, 1 = cards 3-4. Alternatives: 2 = cards 5-6, 3 = cards 3-4 again with 5, clashing.
  const all = [deck(1, 0.6), deck(3, 0.55), deck(5, 0.5), { cardIds: [3, 5], playerScore: 0.7 }];

  test('offers the generated deck again after it was swapped out', () => {
    expect(swapCandidates(all, [2, 1], 0)).toEqual([0, 2]);
  });

  test('lists each deck once and leaves out ones that clash with the other slots', () => {
    expect(swapCandidates(all, [0, 1], 0)).toEqual([0, 2]);
    expect(swapCandidates(all, [0, 1], 1)).toEqual([3, 1, 2]);
  });
});
