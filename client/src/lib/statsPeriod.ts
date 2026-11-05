import type { CardStatsResponse } from '../api';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const battlesIn = (stats: CardStatsResponse) => `${stats.battles.toLocaleString('en-US')} battles in the top 100 war clans`;
const patchSpan = (since: string | null, until: string) => (since ? `${shortDate(since)} to ${shortDate(until)}` : `up to ${shortDate(until)}`);
const sincePhrase = (stats: CardStatsResponse) => (stats.since ? `since the ${shortDate(stats.since)} patch` : 'over the last 30 days');

/** Which battles the numbers come from, in a sentence. */
export function periodNote(stats: CardStatsResponse): string {
  if (stats.isLastPatch && stats.until) {
    return `How every card did in Clan War last patch, from ${battlesIn(stats)} (${patchSpan(stats.since, stats.until)}). The new season's war battles aren't in yet.`;
  }
  return `How every card does in Clan War, from ${battlesIn(stats)} ${sincePhrase(stats)}.`;
}

/** Which battles the numbers come from, for the info tip in the page intro. */
export function sourceNote(stats: CardStatsResponse): string {
  if (stats.isLastPatch && stats.until) {
    return `From ${battlesIn(stats)} last patch (${patchSpan(stats.since, stats.until)}). The new season's war battles aren't in yet.`;
  }
  return `From ${battlesIn(stats)} ${sincePhrase(stats)}.`;
}
