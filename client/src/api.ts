import type { CardVersionRef, CardIconUrls } from './lib/cardDisplay';
import type { ReminderStyle } from './lib/clanWar';

export type PlayerSummary = PlayerResponse['player'];

export const fetchPlayerSummary = (playerTag: string, signal?: AbortSignal): Promise<PlayerSummary> =>
  getJson(`/api/player/${encodeURIComponent(playerTag)}/summary`, 'Failed to fetch player summary', signal);

export class ApiError extends Error {
  status: number;

  constructor(label: string, status: number, public code?: string, public retryAfterMs?: number) {
    super(`${label}: ${status}`);
    this.status = status;
  }
}

/** The server answers 503 while it reloads the meta after a restart, which takes a few minutes. */
export function isMetaLoading(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503 && error.code === 'meta_loading';
}

async function responseError(response: Response, label: string): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const seconds = Number(response.headers.get('Retry-After'));
  return new ApiError(label, response.status, body?.code,
    Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined);
}

async function getJson<T>(url: string, label: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw await responseError(response, label);
  }
  return response.json();
}

export interface DeckCardData {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  elixirCost?: number;
  iconUrls?: CardIconUrls;
}

export interface ScoredDeck {
  cardIds: number[];
  metaWinRate: number;
  confidence: number;
  uses: number;
  players: number;
  pickRate: number;
  playerScore: number;
  cardVersions?: CardVersionRef[];
  metaCardVersions?: CardVersionRef[];
  cards: DeckCardData[];
}

export interface PlayerResponse {
  player: { tag: string; name: string; clanTag: string | null; clanName: string | null; clanBadgeId: number | null };
  warDecks: {
    decks: ScoredDeck[];
    totalScore: number;
    alternatives: ScoredDeck[];
  };
}

export interface CatalogCard {
  id: number;
  name: string;
  maxLevel: number;
  maxEvolutionLevel?: number;
  elixirCost?: number;
  rarity?: string;
  iconUrls?: CardIconUrls;
}

export interface OwnedCard {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  evolutionLevel?: number;
  elixirCost?: number;
  iconUrls?: CardIconUrls;
}

export interface BuilderDeckScore {
  score: number | null;
  isMeta: boolean;
  winRate?: number;
  fieldability?: number;
  players?: number;
}

export interface ScoreDecksResponse {
  decks: BuilderDeckScore[];
  total: number;
}

export interface ScoreDeckCard {
  id: number;
  level: number;
  maxLevel: number;
  evolutionLevel: number;
  rarity?: string;
}

export interface BestDeckEntry {
  cardIds: number[];
  winRate: number;
  confidence: number;
  uses: number;
  players: number;
  pickRate: number;
  metaScore: number;
  cardVersions?: CardVersionRef[];
  cards: Array<Omit<CatalogCard, 'maxEvolutionLevel'>>;
}

export interface BestDeckSet {
  decks: BestDeckEntry[];
  totalScore: number;
}

export interface UpgradeSuggestion {
  cardId: number;
  name?: string;
  kind: 'level' | 'evo' | 'hero';
  fromLevel: number;
  toLevel: number;
  maxLevel: number;
  elixirCost?: number;
  iconUrls?: CardIconUrls;
  scoreDelta: number;
  newTotalScore: number;
  changesLineup: boolean;
  affectedDeckIndexes: number[];
  unlockedDeck?: BestDeckEntry;
}

export interface UpgradeAdviceResponse {
  player: { tag: string; name: string };
  baselineScore: number;
  collectionMaxed: boolean;
  suggestions: UpgradeSuggestion[];
}

export function fetchPlayerWarDecks(playerTag: string, options = '', signal?: AbortSignal): Promise<PlayerResponse> {
  const query = options ? `?${options}` : '';
  return getJson(`/api/player/${encodeURIComponent(playerTag)}${query}`, 'Failed to fetch player data', signal);
}

export function fetchPlayerCollection(
  playerTag: string,
  signal?: AbortSignal
): Promise<{ player: { tag: string; name: string }; cards: OwnedCard[] }> {
  return getJson(`/api/player/${encodeURIComponent(playerTag)}/collection`, 'Failed to fetch player collection', signal);
}

export function fetchUpgradeAdvice(playerTag: string, signal?: AbortSignal): Promise<UpgradeAdviceResponse> {
  return getJson(`/api/player/${encodeURIComponent(playerTag)}/upgrades`, 'Failed to fetch upgrade advice', signal);
}

export type WarPeriod = 'training' | 'warDay' | 'colosseum' | 'notRacing';

export type ClanRole = 'member' | 'elder' | 'coLeader' | 'leader';

export interface PastWarWeek {
  seasonId: number;
  /** 1-based week within the season. */
  week: number;
  rank: number;
  /** What the members earned between them. */
  medals: number;
  endedAt: string | null;
}

export interface ClanWarMember {
  tag: string;
  name: string;
  role: ClanRole;
  lastSeen: string | null;
  decksUsedToday: number;
  decksLeftToday: number;
  decksUsedThisWeek: number;
  fame: number;
  /** These line up with ClanWar.pastWeeks; null when the member wasn't in the clan that week. */
  decksUsedPastWeeks: (number | null)[];
  famePastWeeks: (number | null)[];
}

/** A clan in the river race: fame moves its boat, medalsToday ranks the day. */
export interface RaceClan {
  tag: string;
  name: string;
  fame: number;
  medalsToday: number;
}

/** Members come sorted: on a battle day by decks left, on a training day by last week's decks. */
export interface ClanWar {
  tag: string;
  name: string;
  /** Which in-game shield the clan uses; null when the API leaves it out. */
  badgeId: number | null;
  period: WarPeriod;
  /** Day within the period: training days 1-3, battle days 1-4. */
  day: number;
  isBattleDay: boolean;
  decksLeftToday: number;
  membersDoneToday: number;
  members: ClanWarMember[];
  pastWeeks: PastWarWeek[];
  /** Every clan in the race, furthest boat first. */
  race: RaceClan[];
  /** Estimates from when past races ended; null without past races. */
  dayEndsAt: string | null;
  warStartsAt: string | null;
}

export interface WarDeckPlayed {
  cardIds: number[];
  cardVersions: CardVersionRef[];
}

export interface WarDecksToday {
  decksUsed: number;
  decks: WarDeckPlayed[];
}

export type ClanJoinType = 'open' | 'inviteOnly' | 'closed';

export interface ClanSummary {
  tag: string;
  name: string;
  badgeId: number | null;
  members: number;
  warTrophies: number;
  location: string | null;
  joinType: ClanJoinType;
}

/** Clans with this name, strongest war clan first. */
export const searchClans = (name: string, signal?: AbortSignal): Promise<ClanSummary[]> =>
  getJson(`/api/clans?name=${encodeURIComponent(name)}`, 'Failed to search clans', signal);

export const fetchClanWar = (clanTag: string, signal?: AbortSignal): Promise<ClanWar> =>
  getJson(`/api/clans/${encodeURIComponent(clanTag)}/war`, 'Failed to fetch clan war', signal);

export type ReminderPing = 'nobody' | 'here';

export interface ReminderSettings {
  hoursBeforeReset: number;
  style: ReminderStyle;
  ping: ReminderPing;
  postWhenAllDone: boolean;
}

/** Whether reminders can be set up at all. A clan's own reminders are only shown to whoever pastes their webhook URL. */
export interface ReminderAvailability {
  isAvailable: boolean;
}

export type ReminderProblem =
  | 'unavailable'
  | 'invalidWebhook'
  | 'invalidSettings'
  | 'clanNotFound'
  | 'noResetTime'
  | 'webhookNotFound'
  | 'tooManyReminders'
  | 'tooManyForServer'
  | 'notRegistered'
  | 'discordFailed'
  | 'clashRoyaleFailed'
  | 'busy';

const clanRemindersUrl = (clanTag: string) => `/api/clans/${encodeURIComponent(clanTag)}/discord-reminders`;

async function sendJson(method: string, url: string, body: unknown, label: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw await responseError(response, label);
  }
  return response;
}

export const fetchClanReminders = (clanTag: string, signal?: AbortSignal): Promise<ReminderAvailability> =>
  getJson(clanRemindersUrl(clanTag), 'Failed to fetch Discord reminders', signal);

/** The settings this webhook posts for the clan, or null when it doesn't post for it. */
export async function lookUpClanReminder(clanTag: string, webhookUrl: string, signal?: AbortSignal): Promise<ReminderSettings | null> {
  try {
    const response = await sendJson('POST', `${clanRemindersUrl(clanTag)}/lookup`, { webhookUrl }, 'Failed to look up the Discord reminder', signal);
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError && error.code === 'notRegistered') return null;
    throw error;
  }
}

/** Resolves to the name the webhook has in Discord. */
export async function saveClanReminder(clanTag: string, webhookUrl: string, settings: ReminderSettings): Promise<string | null> {
  const response = await sendJson('PUT', clanRemindersUrl(clanTag), { webhookUrl, settings }, 'Failed to save the Discord reminder');
  const saved: { webhookName: string | null } = await response.json();
  return saved.webhookName;
}

export const testClanReminder = (clanTag: string, webhookUrl: string, settings: ReminderSettings): Promise<unknown> =>
  sendJson('POST', `${clanRemindersUrl(clanTag)}/test`, { webhookUrl, settings }, 'Failed to send a test reminder');

export const deleteClanReminder = (clanTag: string, webhookUrl: string): Promise<unknown> =>
  sendJson('DELETE', clanRemindersUrl(clanTag), { webhookUrl }, 'Failed to turn off the Discord reminder');

export const fetchWarDecksToday = (playerTag: string, signal?: AbortSignal): Promise<WarDecksToday> =>
  getJson(`/api/player/${encodeURIComponent(playerTag)}/war-today`, "Failed to fetch today's war decks", signal);

export interface MetaStatus {
  status: string;
  /** Distinct war decks in the current meta. */
  deckCount: number;
  lastRefresh: string;
}

export function fetchMetaStatus(signal?: AbortSignal): Promise<MetaStatus> {
  return getJson('/api/meta/status', 'Failed to fetch meta status', signal);
}

export function fetchAllCards(signal?: AbortSignal): Promise<{ cards: CatalogCard[] }> {
  return getJson('/api/cards', 'Failed to fetch card catalog', signal);
}

export function fetchBestDecks(signal?: AbortSignal): Promise<{ sets: BestDeckSet[] }> {
  return getJson('/api/best-decks', 'Failed to fetch best decks', signal);
}

/** One card's war numbers; the change since the last patch is only set when both patches have enough games. */
export interface CardStat {
  id: number;
  games: number;
  winRate: number;
  playRate: number;
  evoShare: number;
  heroShare: number;
  previousGames: number;
  previousWinRate: number | null;
  previousPlayRate: number | null;
  winRateChange: number | null;
  /** How far chance alone could move the win rate with this many games (two standard errors). */
  changeMargin: number | null;
  /** The change is bigger than the margin. */
  changeIsClear: boolean;
}

export interface CardStatsResponse {
  /** Start of the period the numbers cover; null when there is no patch boundary yet. */
  since: string | null;
  /** Set while the new patch has too few battles, so the numbers are the last patch's. */
  until: string | null;
  battles: number;
  isLastPatch: boolean;
  cards: CardStat[];
}

export function fetchCardStats(signal?: AbortSignal): Promise<CardStatsResponse> {
  return getJson('/api/cards/stats', 'Failed to fetch card stats', signal);
}

export function fetchCardDecks(cardId: number, signal?: AbortSignal): Promise<{ decks: BestDeckEntry[] }> {
  return getJson(`/api/cards/${cardId}/decks`, 'Failed to fetch decks for this card', signal);
}

export async function scoreBuilderDecks(
  cards: ScoreDeckCard[],
  decks: (number | null)[][],
  maxed: boolean,
  signal?: AbortSignal
): Promise<ScoreDecksResponse> {
  const response = await fetch('/api/score-decks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards, decks, maxed }),
    signal,
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to score decks');
  }
  return response.json();
}

export interface StatsCount {
  key: string;
  users: number;
}

export interface StatsPoint {
  key: string;
  users: number;
  visitors: number;
}

export interface StatsFilters {
  source?: string;
  country?: string;
  device?: string;
}

export interface StatsRange {
  key: 'today' | '7d' | '30d' | '90d';
  from: string;
  to: string;
  users: number;
  previousUsers: number | null;
  visitors: number;
  previousVisitors: number | null;
  lookups: number;
  players: number;
  returning: number;
  shareTaps: number;
  previews: number;
  shareOpens: number;
  newFromShare: number;
  daily: StatsPoint[];
  /** The period before, day by day, lined up with daily; null where there's no period before to compare. */
  previousDaily: StatsPoint[] | null;
  hourly: StatsPoint[] | null;
  countries: StatsCount[];
  /** Per country and source: how many of its visitors looked up a player. */
  countryUsers: StatsCount[];
  sourceUsers: StatsCount[];
  campaigns: StatsCount[];
  devices: StatsCount[];
  sources: StatsCount[];
  tools: StatsCount[];
  deckExports: StatsDeckExports;
  /** Median seconds a visitor had the site in view; null when nobody's time was measured. */
  timeMedian: number | null;
  previousTimeMedian: number | null;
  timeMean: number | null;
  timeVisitors: number;
  sourceTime: StatsDuration[];
}

export interface StatsDuration {
  key: string;
  seconds: number;
  visitors: number;
}

export interface StatsDeckExports {
  copies: number;
  opens: number;
  visitors: number;
  tools: { key: string; copies: number; opens: number; visitors: number }[];
}

export interface StatsMonth {
  month: string;
  partial: boolean;
  users: number;
  visitors: number;
  lookups: number;
  players: number;
  shareOpens: number;
  newFromShare: number;
  timeMedian: number | null;
  deckCopies: number;
  deckOpens: number;
  deckExporters: number;
}

export interface StatsReport {
  generatedAt: string;
  retentionDays: number;
  /** Visitors with the site open in view when the report was made; the live connection keeps it current. */
  inView: number;
  /** Every Discord webhook that posts reminders, all-time; the filters and ranges don't apply. */
  discordWebhooks: number;
  filters: StatsFilters;
  ranges: StatsRange[];
  months: StatsMonth[];
}

/** The token goes in a header, never the URL, where logs and history would keep it. */
export async function fetchAdminStats(token: string, filters: StatsFilters, signal?: AbortSignal): Promise<StatsReport> {
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => !!entry[1])).toString();
  const response = await fetch(`/api/admin/stats${query ? `?${query}` : ''}`, { headers: { 'X-Admin-Token': token }, signal, cache: 'no-store' });
  if (!response.ok) {
    throw await responseError(response, 'Failed to fetch stats');
  }
  return response.json();
}
