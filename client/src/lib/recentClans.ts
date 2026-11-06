import { isValidTag, normalizeTag } from './playerTag';

export interface ClanRef {
  tag: string;
  name: string;
  badgeId: number | null;
}

const STORAGE_KEY = 'recentClans';
const MAX_STORED = 5;
export const MAX_SHOWN = 3;
export const MIN_NAME_LENGTH = 3;

const isClanRef = (value: unknown): value is ClanRef => {
  const c = value as ClanRef | null;
  return typeof c?.tag === 'string' && typeof c?.name === 'string' && (c.badgeId === null || typeof c.badgeId === 'number');
};

export function loadRecentClans(): ClanRef[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isClanRef) : [];
  } catch {
    return [];
  }
}

/** Moves the clan to the front of the list, newest first. */
export function rememberClan(clan: ClanRef): ClanRef[] {
  const clans = [clan, ...loadRecentClans().filter((c) => c.tag !== clan.tag)].slice(0, MAX_STORED);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clans));
  } catch {
    // Storage can be full or blocked; the list just won't survive a reload.
  }
  return clans;
}

/** The clans worth a shortcut: not the one the back link already leads to. */
export const recentClansToShow = (clans: ClanRef[], ownTag: string | null): ClanRef[] =>
  clans.filter((c) => c.tag !== ownTag).slice(0, MAX_SHOWN);

/**
 * What the finder's one field holds: a name to search for, a tag to open, or both. A leading # means a tag; some
 * names are spelled only with tag letters ("LUCY"), so without one such input is searched and offered as a tag.
 */
export function parseClanQuery(raw: string): { name: string | null; tag: string | null } {
  const text = raw.trim();
  const tag = isValidTag(text) ? normalizeTag(text) : null;
  if (text.startsWith('#')) return { name: null, tag };
  return { name: text.length >= MIN_NAME_LENGTH ? text : null, tag };
}
