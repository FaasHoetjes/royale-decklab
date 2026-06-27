interface ScoredDeckDTO {
  cardIds: number[];
  metaWinRate: number;
  confidence: number;
  uses: number;
  players: number;
  pickRate: number;
  playerScore: number;
  cardVersions?: Array<{ cardId: number; version: 'normal' | 'evo' | 'hero' }>;
  metaCardVersions?: Array<{ cardId: number; version: 'normal' | 'evo' | 'hero' }>;
  cards: Array<{
    id: number;
    name: string;
    level: number;
    maxLevel: number;
    elixerCost: number;
  }>;
}

interface PlayerResponse {
  player: {
    tag: string;
    name: string;
  };
  warDecks: {
    decks: ScoredDeckDTO[];
    totalScore: number;
    alternatives: ScoredDeckDTO[];
  };
}

// True for the DOMException thrown when a fetch is cancelled via AbortController.
// Callers use it to swallow the rejection an aborted request produces (e.g. a
// StrictMode double-mount or a superseded request) instead of showing an error.
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export async function fetchPlayerWarDecks(
  playerTag: string,
  signal?: AbortSignal
): Promise<PlayerResponse> {
  const encodedTag = encodeURIComponent(playerTag);
  const response = await fetch(`/api/player/${encodedTag}`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch player data: ${response.status}`);
  }

  return response.json();
}

export async function fetchMetaStatus(signal?: AbortSignal) {
  const response = await fetch('/api/meta/status', { signal });
  if (!response.ok) {
    throw new Error('Failed to fetch meta status');
  }
  return response.json();
}

export interface CatalogCard {
  id: number;
  name: string;
  maxLevel: number;
  maxEvolutionLevel?: number;
  elixirCost?: number;
  rarity?: string;
  iconUrls?: {
    medium?: string;
    evolutionMedium?: string;
  };
}

export interface OwnedCard {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  evolutionLevel?: number;
  elixirCost?: number;
  iconUrls?: {
    medium?: string;
    evolutionMedium?: string;
    heroMedium?: string;
  };
}

export async function fetchAllCards(signal?: AbortSignal): Promise<{ cards: CatalogCard[] }> {
  const response = await fetch('/api/cards', { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch card catalog: ${response.status}`);
  }
  return response.json();
}

// One deck's score in the War Deck Builder: always `winRate × fieldability` on a
// single comparable scale. A meta-matched deck (`isMeta: true`) uses its real
// confidence-adjusted win rate + carries the player count; any other deck uses a
// neutral 0.5 win-rate prior. `score` is null when the deck is empty or a card is
// missing from the collection.
export interface BuilderDeckScore {
  score: number | null;
  isMeta: boolean;
  // The win-rate factor used (real confidence for meta decks, 0.5 prior otherwise)
  // and the level-based fieldability factor. Present whenever score is non-null.
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

export interface BestDeckCard {
  id: number;
  name: string;
  maxLevel: number;
  elixirCost?: number;
  rarity?: string;
  iconUrls?: {
    medium?: string;
    evolutionMedium?: string;
    heroMedium?: string;
  };
}

export interface BestDeckEntry {
  cardIds: number[];
  winRate: number;
  confidence: number;
  uses: number;
  players: number;
  pickRate: number;
  metaScore: number;
  cardVersions?: Array<{ cardId: number; version: 'normal' | 'evo' | 'hero' }>;
  cards: BestDeckCard[];
}

export interface BestDeckSet {
  decks: BestDeckEntry[];
  totalScore: number;
}

export interface BestDecksResponse {
  sets: BestDeckSet[];
}

export async function fetchBestDecks(signal?: AbortSignal): Promise<BestDecksResponse> {
  const response = await fetch('/api/best-decks', { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch best decks: ${response.status}`);
  }
  return response.json();
}

export async function fetchPlayerCollection(
  playerTag: string,
  signal?: AbortSignal
): Promise<{ player: { tag: string; name: string }; cards: OwnedCard[] }> {
  const encodedTag = encodeURIComponent(playerTag);
  const response = await fetch(`/api/player/${encodedTag}/collection`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch player collection: ${response.status}`);
  }
  return response.json();
}
