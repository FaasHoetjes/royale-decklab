import type { CardVersionRef, CardIconUrls } from './lib/cardDisplay';

export class ApiError extends Error {
  status: number;

  constructor(label: string, status: number) {
    super(`${label}: ${status}`);
    this.status = status;
  }
}

/** The server answers 503 while it reloads the meta after a restart, which takes a few minutes. */
export function isMetaLoading(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503;
}

async function getJson<T>(url: string, label: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new ApiError(label, response.status);
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
  player: { tag: string; name: string };
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
  signal?: AbortSignal
): Promise<ScoreDecksResponse> {
  const response = await fetch('/api/score-decks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards, decks }),
    signal,
  });
  if (!response.ok) {
    throw new ApiError('Failed to score decks', response.status);
  }
  return response.json();
}

export interface StatsCount {
  key: string;
  users: number;
}

export interface StatsRange {
  key: 'today' | '7d' | '30d' | '90d';
  from: string;
  to: string;
  /** People seen in both months count twice, since everyone's anonymous code changes each month. */
  spansMonths: boolean;
  users: number;
  previousUsers: number | null;
  lookups: number;
  players: number;
  returning: number;
  shareTaps: number;
  previews: number;
  shareOpens: number;
  newFromShare: number;
  daily: StatsCount[];
  countries: StatsCount[];
  devices: StatsCount[];
  sources: StatsCount[];
  tools: StatsCount[];
}

export interface StatsMonth {
  month: string;
  partial: boolean;
  users: number;
  lookups: number;
  players: number;
  shareOpens: number;
  newFromShare: number;
}

export interface StatsReport {
  generatedAt: string;
  retentionDays: number;
  ranges: StatsRange[];
  months: StatsMonth[];
}

/** The token goes in a header, never the URL, where logs and history would keep it. */
export async function fetchAdminStats(token: string, signal?: AbortSignal): Promise<StatsReport> {
  const response = await fetch('/api/admin/stats', { headers: { 'X-Admin-Token': token }, signal, cache: 'no-store' });
  if (!response.ok) {
    throw new ApiError('Failed to fetch stats', response.status);
  }
  return response.json();
}
