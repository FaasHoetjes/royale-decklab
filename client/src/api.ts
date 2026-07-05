// Typed fetch helpers for the backend API. Components consume these through
// the React Query hooks in queries.ts.
import type { CardVersionRef, CardIconUrls } from './lib/cardDisplay';

async function getJson<T>(url: string, label: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`${label}: ${response.status}`);
  }
  return response.json();
}

/** A card as it appears inside a scored deck's card list. */
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
  // cardVersions is personalised to the player (unowned specials downgraded);
  // metaCardVersions is what top players actually fielded.
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

/**
 * One deck's score in the War Deck Builder: always `winRate × fieldability` on
 * a single comparable scale. A meta-matched deck (`isMeta`) uses its real
 * confidence-adjusted win rate; any other deck uses a neutral 0.5 prior.
 * `score` is null when the deck is empty or a card is missing.
 */
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

/**
 * One recommended upgrade. Kind 'level' raises the card from `fromLevel` to
 * `toLevel` (more than one level when that's the cheapest jump that changes the
 * lineup); 'evo'/'hero' unlock that special version (levels unchanged).
 * `affectedDeckIndexes` are the current lineup decks (0-3) the change can move;
 * empty with `changesLineup` true means the upgrade promotes a deck that isn't
 * in the lineup yet.
 */
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
}

export interface UpgradeAdviceResponse {
  player: { tag: string; name: string };
  baselineScore: number;
  /** True when nothing was even simulatable: every meta card maxed, every fielded evo/hero owned. */
  collectionMaxed: boolean;
  suggestions: UpgradeSuggestion[];
}

export function fetchPlayerWarDecks(playerTag: string, signal?: AbortSignal): Promise<PlayerResponse> {
  return getJson(`/api/player/${encodeURIComponent(playerTag)}`, 'Failed to fetch player data', signal);
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

export function fetchMetaStatus(signal?: AbortSignal): Promise<{ status: string }> {
  return getJson('/api/meta/status', 'Failed to fetch meta status', signal);
}

export function fetchAllCards(signal?: AbortSignal): Promise<{ cards: CatalogCard[] }> {
  return getJson('/api/cards', 'Failed to fetch card catalog', signal);
}

export function fetchBestDecks(signal?: AbortSignal): Promise<{ sets: BestDeckSet[] }> {
  return getJson('/api/best-decks', 'Failed to fetch best decks', signal);
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
    throw new Error(`Failed to score decks: ${response.status}`);
  }
  return response.json();
}
