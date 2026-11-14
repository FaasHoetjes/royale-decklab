import { describe, expect, test } from 'bun:test';
import { scrollDuration } from './motion';

describe('scrollDuration', () => {
  test('takes longer for a longer way', () => {
    expect(scrollDuration(900)).toBeGreaterThan(scrollDuration(500));
  });

  test('stays between 400 and 800 ms, whichever way it goes', () => {
    expect(scrollDuration(10)).toBe(400);
    expect(scrollDuration(-10_000)).toBe(800);
  });
});
