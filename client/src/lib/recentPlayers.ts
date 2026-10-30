export interface RecentPlayer {
  tag: string;
  name: string;
}

const KEY = 'recentPlayers';
const MAX = 5;

export function loadRecentPlayers(): RecentPlayer[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p?.tag === 'string' && typeof p?.name === 'string') : [];
  } catch {
    return [];
  }
}

function save(players: RecentPlayer[]): RecentPlayer[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(players));
  } catch {
    // Storage can be full or blocked; the list just won't survive a reload.
  }
  return players;
}

/** Moves the player to the front of the list, newest first. */
export function rememberPlayer(tag: string, name: string): RecentPlayer[] {
  return save([{ tag, name }, ...loadRecentPlayers().filter((p) => p.tag !== tag)].slice(0, MAX));
}

export function forgetPlayer(tag: string): RecentPlayer[] {
  return save(loadRecentPlayers().filter((p) => p.tag !== tag));
}
