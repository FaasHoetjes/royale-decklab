import { isMetaLoading } from '../api';

// Reloading the meta after a deploy takes a few minutes, so those requests wait it out instead of failing.
const META_RETRY_MS = 15_000;
const MAX_META_RETRIES = 40;

export function shouldRetry(failures: number, error: Error): boolean {
  return isMetaLoading(error) ? failures < MAX_META_RETRIES : failures < 1;
}

export function retryDelay(failures: number, error: Error): number {
  return isMetaLoading(error) ? META_RETRY_MS : Math.min(1000 * 2 ** failures, 30_000);
}
