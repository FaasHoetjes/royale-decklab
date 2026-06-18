export interface PlayerData {
    tag: string;
    name: string;
    currentDeck: PlayerItemLevelList;
    currentDeckSupportCards: PlayerItemLevelList;
    cards: PlayerItemLevelList;
    supportCards: PlayerItemLevelList;
}

export interface PlayerItemLevelList {
    playerItemLevels: PlayerItemLevel[];
}

export interface PlayerItemLevel {
    id: number;
    rarity: Rarity;
    count: number;
    level: number;
    starLevel: number;
    evolutionLevel: number;
    used: boolean;
    name: string;
    maxLevel: number;
    elixerCost: number;
    maxEvolutionLevel: number;
}

export enum Rarity {
    COMMON = "common",
    RARE = "rare",
    EPIC = "epic",
    LEGENDARY = "legendary",
    CHAMPION = "champion"
}

export interface CardVersion {
    cardId: number;
    version: 'normal' | 'evo' | 'hero';
}

/**
 * Smoothing constant for the popularity weight. Higher = harsher on decks run
 * by few players. At 4: 1 player → 0.20, 4 → 0.50, 8 → 0.67, 20 → 0.83.
 */
export const PLAYER_PRIOR = 4;

/**
 * How much to trust a deck as genuinely "meta" based on how many distinct top
 * players ran it. A deck one person plays 30 times isn't representative even at
 * a great win rate; eight people playing it is a real signal. Returns a factor
 * in (0, 1) that rises with player count and saturates — no hard cutoff, in the
 * same spirit as the Wilson bound on win rate.
 */
export function popularityWeight(players: number): number {
    if (players <= 0) {
        return 0;
    }
    return players / (players + PLAYER_PRIOR);
}

/**
 * A single observed battle, the raw unit the rolling meta store is built from.
 * Battles are kept (deduped by `key`, pruned to a time window) across refreshes
 * so deck samples accumulate instead of resetting on every rebuild.
 */
export interface BattleRecord {
    /** Dedup key: a given player's battle at a given time is one observation. */
    key: string;
    /** Raw API battleTime, e.g. "20240617T120000.000Z". Used for pruning. */
    battleTime: string;
    playerTag: string;
    /** The 8 card ids, sorted ascending so an identical deck always keys the same. */
    cardIds: number[];
    result: 'win' | 'loss' | 'draw';
    cardVersions: CardVersion[];
}

export interface DeckMeta {
    cardIds: number[];
    winRate: number;
    /**
     * Wilson score lower bound on the win rate: it discounts the observed win
     * rate by how uncertain it is, so a high win rate over many games outranks
     * the same rate over a few. This is the displayed win rate. Ranking and the
     * player score combine it with popularityWeight(players) so a deck few
     * players run can't top the list on win rate alone.
     */
    confidence: number;
    uses: number;
    /** Distinct top players who ran this deck within the sample window. */
    players?: number;
    /** Fraction of sampled players who ran this deck (0-1). */
    pickRate?: number;
    cardVersions?: CardVersion[];
}

export interface ScoredDeck {
    cardIds: number[];
    metaWinRate: number;
    confidence: number;
    uses: number;
    players: number;
    pickRate: number;
    playerScore: number;
    cards: PlayerItemLevel[];
    /** Which cards the meta deck fielded as evolutions, so the UI can show them. */
    cardVersions?: CardVersion[];
}

export interface WarDeckResult {
    decks: ScoredDeck[];
    totalScore: number;
}
