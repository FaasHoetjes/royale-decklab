import { describe, expect, test } from 'bun:test';
import { ApiError } from '../api';
import { retryDelay, shouldRetry } from './retry';

describe('shouldRetry', () => {
  test('keeps waiting while the server reloads the meta', () => {
    const loading = new ApiError('Failed to fetch card stats', 503);
    expect(shouldRetry(1, loading)).toBe(true);
    expect(shouldRetry(39, loading)).toBe(true);
    expect(shouldRetry(40, loading)).toBe(false);
    expect(retryDelay(1, loading)).toBe(15_000);
  });

  test('retries other failures once', () => {
    const failed = new ApiError('Failed to fetch card stats', 500);
    expect(shouldRetry(0, failed)).toBe(true);
    expect(shouldRetry(1, failed)).toBe(false);
    expect(shouldRetry(0, new Error('network'))).toBe(true);
    expect(retryDelay(1, failed)).toBe(2_000);
  });
});
