// Anonymous usage pings for the admin stats page. Deck exports count every action; other events skip repeats
// within a page load here and count each visitor once a day per event on the server.
import { isValidTag } from './playerTag';

export type StatsTool = 'home' | 'generator' | 'builder' | 'upgrades' | 'best-decks' | 'cards' | 'card' | 'clan' | 'faq';
type DeckExportTool = Extract<StatsTool, 'generator' | 'builder' | 'upgrades' | 'best-decks'>;
type DeckExportKind = 'deck_copy' | 'deck_open';

export type StatsEvent =
  | { kind: 'lookup' | 'share_open'; tag: string }
  | { kind: 'share' }
  | { kind: DeckExportKind; tool: DeckExportTool }
  | { kind: 'tool'; tool: StatsTool };

const EXCLUDE_KEY = 'statsExcluded';
const sent = new Set<string>();

export interface Campaign {
  utmSource?: string;
  utmCampaign?: string;
}

/**
 * Reads a campaign link's utm_ tags and takes them out of the address bar, so a link copied from the page doesn't
 * credit the campaign again. Runs once, before the router reads the URL.
 */
export function takeCampaign(location: { href: string }, replace: (url: string) => void): Campaign {
  try {
    const url = new URL(location.href);
    const utmSource = url.searchParams.get('utm_source')?.slice(0, 64) || undefined;
    const utmCampaign = url.searchParams.get('utm_campaign')?.slice(0, 64) || undefined;
    const tags = [...url.searchParams.keys()].filter((key) => key.startsWith('utm_'));
    if (tags.length === 0) return {};
    tags.forEach((key) => url.searchParams.delete(key));
    replace(url.pathname + url.search + url.hash);
    return { utmSource, utmCampaign };
  } catch {
    return {};
  }
}

const campaign: Campaign = typeof window === 'undefined'
  ? {}
  : takeCampaign(window.location, (url) => window.history.replaceState(window.history.state, '', url));

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
  if (first === 'clan') return 'clan';
  if (second) return null;
  if (first === 'builder' || first === 'upgrades' || first === 'best-decks' || first === 'faq') return first;
  return isValidTag(first) ? 'generator' : null;
}

export function track(event: StatsEvent): void {
  if (isStatsExcluded()) return;
  if (event.kind !== 'deck_copy' && event.kind !== 'deck_open') {
    const key = JSON.stringify(event);
    if (sent.has(key)) return;
    sent.add(key);
  }
  fetch('/api/stats/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...event, ref: referrerHost(), ...campaign }),
    keepalive: true,
  }).catch(() => {});
}

/** Only the page category is sent: no deck URL, cards, or player tag. */
export function trackDeckExport(kind: DeckExportKind): void {
  const tool = toolForPath(window.location.pathname);
  if (tool === 'generator' || tool === 'builder' || tool === 'upgrades' || tool === 'best-decks') {
    track({ kind, tool });
  }
}
