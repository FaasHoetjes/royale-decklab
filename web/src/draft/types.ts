// Core types for the Mega Draft vs Computer gamemode.
//
// The draft engine is intentionally pure: pool generation, scoring and the AI
// are all plain functions over these types, so they can be unit-tested without
// any React or network involvement (see web/src/draft/*).

/** Role buckets a card can fill. A card may belong to several at once. */
export type Bucket =
  | 'winCondition'
  | 'building'
  | 'bigSpell'
  | 'smallSpell'
  | 'antiAir'
  | 'antiTank'
  | 'tankMiniTank'
  | 'cycleSupport'
  | 'special';

/** Win-condition family, used only to keep generated pools varied (§3). */
export type Archetype = 'beatdown' | 'spam' | 'siege' | 'cycle' | 'bait' | 'none';

/**
 * Curated metadata for one draftable card. Booleans default to false when
 * omitted in the dataset (see web/src/data/cardTags.ts) to keep authoring terse.
 * `air`/`targetsAir`/etc. are the primitive attributes the counter engine reads.
 */
export interface CardTag {
  id: number;
  name: string;
  elixir: number;
  buckets: Bucket[];
  /** This card is itself an air unit. */
  air?: boolean;
  /** This card can hit air units (troop, building or spell). */
  targetsAir?: boolean;
  /** Deals area damage. */
  splash?: boolean;
  ranged?: boolean;
  /** Multiple small bodies (good target for splash / small spells). */
  swarm?: boolean;
  building?: boolean;
  /** Primary tower-damage threat. */
  winCondition?: boolean;
  spellSize?: 'small' | 'big';
  /** High-HP front-line body. */
  tank?: boolean;
  champion?: boolean;
  /** Only meaningful when winCondition is true. */
  archetype?: Archetype;
}

export type Side = 'player' | 'computer';
export type Difficulty = 'easy' | 'medium' | 'hard';

/** One cell of the shared 36-card pool. */
export interface PoolCard {
  card: CardTag;
  /** Who has drafted this card, or null while still available. */
  taken: Side | null;
  /** Pick number (1-based) this card was taken on, for ordering the trays. */
  pickedAt?: number;
}

/** Catalog card shape we need from the backend `/api/cards` to join art. */
export interface CatalogLite {
  id: number;
  name: string;
  elixirCost?: number;
  iconUrls?: { medium?: string };
}
