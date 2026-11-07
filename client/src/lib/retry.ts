import { ApiError, isMetaLoading } from '../api';

// Reloading the meta after a deploy takes a few minutes, so those requests wait it out instead of failing.
const META_RETRY_MS = 15_000;
const MAX_META_RETRIES = 40;
const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

export function shouldRetry(failures: number, error: Error): boolean {
  return isMetaLoading(error) ? failures < MAX_META_RETRIES : failures < 1;
}

export function retryDelay(failures: number, error: Error): number {
  if (isMetaLoading(error)) return META_RETRY_MS;
  if (error instanceof ApiError && error.retryAfterMs) return Math.min(error.retryAfterMs, MAX_RETRY_MS);
  return Math.min(FIRST_RETRY_MS * 2 ** failures, MAX_RETRY_MS);
}
