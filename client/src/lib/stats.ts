// Anonymous usage pings for the admin stats page. Nothing is stored in the visitor's browser for this: repeats
// within a page load are skipped here, and the server counts each visitor once a day per event.
import { isValidTag } from './playerTag';

export type StatsTool = 'home' | 'generator' | 'builder' | 'upgrades' | 'best-decks' | 'cards' | 'card' | 'faq';

export type StatsEvent =
  | { kind: 'lookup' | 'share_open'; tag: string }
  | { kind: 'share' }
  | { kind: 'tool'; tool: StatsTool };

const EXCLUDE_KEY = 'statsExcluded';
const sent = new Set<string>();

/** Set on the admin's own browsers, so testing the site doesn't count as visits. */
export function isStatsExcluded(): boolean {
  try {
    return localStorage.getItem(EXCLUDE_KEY) === '1';
  } catch {
    return false;
  }
}

export function excludeThisBrowser(): void {
  try {
    localStorage.setItem(EXCLUDE_KEY, '1');
  } catch {
    // Without storage the admin's visits simply count.
  }
}

/** The site the visit came from; only its host name is sent, and the server keeps just a fixed name for it. */
export function referrerHost(referrer = document.referrer, ownHost = window.location.host): string {
  try {
    const host = new URL(referrer).host;
    return host === ownHost ? '' : host;
  } catch {
    return '';
  }
}

export function toolForPath(pathname: string): StatsTool | null {
  const [first = '', second] = pathname.split('/').filter(Boolean);
  if (!first) return 'home';
  if (first === 'cards') return second ? 'card' : 'cards';
  if (second) return null;
  if (first === 'builder' || first === 'upgrades' || first === 'best-decks' || first === 'faq') return first;
  return isValidTag(first) ? 'generator' : null;
}

export function track(event: StatsEvent): void {
  if (isStatsExcluded()) return;
  const key = JSON.stringify(event);
  if (sent.has(key)) return;
  sent.add(key);
  fetch('/api/stats/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...event, ref: referrerHost() }),
    keepalive: true,
  }).catch(() => {});
}
