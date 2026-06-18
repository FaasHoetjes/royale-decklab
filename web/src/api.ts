interface PlayerResponse {
  player: {
    tag: string;
    name: string;
  };
  warDecks: {
    decks: Array<{
      cardIds: number[];
      metaWinRate: number;
      confidence: number;
      uses: number;
      players: number;
      pickRate: number;
      playerScore: number;
      cardVersions?: Array<{ cardId: number; version: 'normal' | 'evo' | 'hero' }>;
      cards: Array<{
        id: number;
        name: string;
        level: number;
        maxLevel: number;
        elixerCost: number;
      }>;
    }>;
    totalScore: number;
  };
}

export async function fetchPlayerWarDecks(playerTag: string): Promise<PlayerResponse> {
  const encodedTag = encodeURIComponent(playerTag);
  const response = await fetch(`/api/player/${encodedTag}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch player data: ${response.status}`);
  }

  return response.json();
}

export async function fetchMetaStatus() {
  const response = await fetch('/api/meta/status');
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

export async function fetchAllCards(): Promise<{ cards: CatalogCard[] }> {
  const response = await fetch('/api/cards');
  if (!response.ok) {
    throw new Error(`Failed to fetch card catalog: ${response.status}`);
  }
  return response.json();
}

export async function fetchPlayerCollection(
  playerTag: string
): Promise<{ player: { tag: string; name: string }; cards: OwnedCard[] }> {
  const encodedTag = encodeURIComponent(playerTag);
  const response = await fetch(`/api/player/${encodedTag}/collection`);
  if (!response.ok) {
    throw new Error(`Failed to fetch player collection: ${response.status}`);
  }
  return response.json();
}
