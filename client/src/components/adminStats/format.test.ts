import { describe, expect, test } from 'bun:test';
import { duration } from './format';

describe('duration', () => {
  test('shows seconds, then minutes, then hours', () => {
    expect(duration(0)).toBe('0s');
    expect(duration(59)).toBe('59s');
    expect(duration(60)).toBe('1m 00s');
    expect(duration(84)).toBe('1m 24s');
    expect(duration(3599)).toBe('59m 59s');
    expect(duration(3600)).toBe('1h 00m');
    expect(duration(14_400)).toBe('4h 00m');
  });
});
