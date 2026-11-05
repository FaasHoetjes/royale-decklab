import type { StatsFilters, StatsRange } from '../../api';

export const RANGE_LABELS: Record<StatsRange['key'], string> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direct or unknown',
  reddit: 'Reddit',
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  ai: 'AI assistants',
  discord: 'Discord',
  youtube: 'YouTube',
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  other: 'Other sites',
};

const TOOL_LABELS: Record<string, string> = {
  home: 'Start page',
  generator: 'War deck generator',
  builder: 'Deck builder',
  upgrades: 'Upgrade advisor',
  'best-decks': 'Best decks',
  cards: 'Cards list',
  card: 'Card pages',
  faq: 'FAQ',
};

const DEVICE_LABELS: Record<string, string> = { phone: 'Phone', desktop: 'Desktop' };

const UNKNOWN_COUNTRY = 'XX';

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

export const countryLabel = (key: string) => (key === UNKNOWN_COUNTRY ? 'Unknown' : countryNames?.of(key) ?? key);
export const sourceLabel = (key: string) => SOURCE_LABELS[key] ?? key;
export const deviceLabel = (key: string) => DEVICE_LABELS[key] ?? key;
export const toolLabel = (key: string) => TOOL_LABELS[key] ?? key;

export const FILTER_NAMES: Record<keyof StatsFilters, string> = { source: 'Source', country: 'Country', device: 'Device' };
export const FILTER_LABELS: Record<keyof StatsFilters, (key: string) => string> = {
  source: sourceLabel,
  country: countryLabel,
  device: deviceLabel,
};

export const number = (value: number) => value.toLocaleString('en-US');

export const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–');

const pad = (value: number) => String(value).padStart(2, '0');

export const duration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
};

export const changeFrom = (now: number, before: number | null): string | undefined => {
  if (!before) return undefined;
  const change = Math.round(((now - before) / before) * 100);
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change}% vs the period before`;
};
