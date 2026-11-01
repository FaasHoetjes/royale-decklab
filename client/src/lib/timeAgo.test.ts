import { describe, expect, test } from 'bun:test';
import { timeAgo } from './timeAgo';

const now = Date.parse('2026-11-01T12:00:00Z');
const ago = (ms: number) => timeAgo(new Date(now - ms).toISOString(), now);
const MIN = 60_000;

describe('timeAgo', () => {
  test('under a minute, and clock skew into the future, read as just now', () => {
    expect(ago(30_000)).toBe('just now');
    expect(ago(-5 * MIN)).toBe('just now');
  });

  test('counts minutes, then hours, then days, with singulars', () => {
    expect(ago(20 * MIN)).toBe('20 min ago');
    expect(ago(60 * MIN)).toBe('1 hour ago');
    expect(ago(150 * MIN)).toBe('2 hours ago');
    expect(ago(24 * 60 * MIN)).toBe('1 day ago');
    expect(ago(3 * 24 * 60 * MIN)).toBe('3 days ago');
  });

  test('an unreadable date reads as just now instead of NaN', () => {
    expect(timeAgo('not a date', now)).toBe('just now');
  });
});
