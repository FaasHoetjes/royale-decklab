// Shared logic for displaying deck cards: version-aware icons, the unified /16
// level scale, elixir stats, the archetype label, and the positional
// evo/hero/both slot ordering used by every deck view.

export type CardVersion = 'normal' | 'evo' | 'hero';

export interface CardVersionRef {
  cardId: number;
  version: CardVersion;
}

export interface CardIconUrls {
  medium?: string;
  evolutionMedium?: string;
  heroMedium?: string;
}

/** A card's version in a cardVersions list (default: normal). */
export function versionOf(refs: CardVersionRef[] | undefined, cardId: number): CardVersion {
  return refs?.find((v) => v.cardId === cardId)?.version ?? 'normal';
}

/** The icon for a card version, falling back to the closest art that exists. */
export function cardIconUrl(iconUrls: CardIconUrls | undefined, version: CardVersion): string {
  const { medium, evolutionMedium, heroMedium } = iconUrls ?? {};
  if (version === 'hero') return heroMedium || evolutionMedium || medium || '';
  if (version === 'evo') return evolutionMedium || medium || '';
  return medium || '';
}

/** Normalizes a card level to the unified /16 king-level scale. */
export function displayLevel(level: number, maxLevel: number): number {
  return level + (16 - maxLevel);
}

export function avgElixir(cards: Array<{ elixirCost?: number }>): number {
  if (cards.length === 0) return 0;
  return cards.reduce((sum, c) => sum + (c.elixirCost ?? 0), 0) / cards.length;
}

// At-a-glance archetype heuristic: a heavy tank with high average elixir reads
// as Beatdown, a very cheap deck as Cycle, everything else as Control.
const BEATDOWN_TANKS = ['Golem', 'Lava Hound', 'Electro Giant', 'Giant', 'Goblin Giant'];

export function deckArchetype(cards: Array<{ name: string; elixirCost?: number }>): string {
  const avg = avgElixir(cards);
  const hasTank = cards.some((c) => BEATDOWN_TANKS.includes(c.name));
  return hasTank && avg >= 3.8 ? 'Beatdown' : avg <= 3.2 ? 'Cycle' : 'Control';
}

/**
 * Orders cards like the in-game evolution slots, which are positional: slot 1
 * holds an evo, slot 2 the hero, slot 3 whichever special is left. Empty
 * special slots are filled by normal cards so the grid stays gapless.
 */
export function orderBySlots<T extends { id: number }>(
  cards: T[],
  version: (cardId: number) => CardVersion
): T[] {
  const evoQueue = cards.filter((c) => version(c.id) === 'evo');
  const heroQueue = cards.filter((c) => version(c.id) === 'hero');
  const normals = cards.filter((c) => version(c.id) === 'normal');

  const specials = [evoQueue.shift(), heroQueue.shift(), evoQueue.shift() ?? heroQueue.shift()];
  return specials
    .map((slot) => slot ?? normals.shift())
    .filter((c): c is T => c !== undefined)
    .concat(normals, evoQueue, heroQueue);
}
