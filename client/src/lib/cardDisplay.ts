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

export function versionOf(refs: CardVersionRef[] | undefined, cardId: number): CardVersion {
  return refs?.find((v) => v.cardId === cardId)?.version ?? 'normal';
}

export function cardIconUrl(iconUrls: CardIconUrls | undefined, version: CardVersion): string {
  const { medium, evolutionMedium, heroMedium } = iconUrls ?? {};
  if (version === 'hero') return heroMedium || evolutionMedium || medium || '';
  if (version === 'evo') return evolutionMedium || medium || '';
  return medium || '';
}

/** Normalizes to the unified /16 king-level scale (rarities cap below 16). */
export function displayLevel(level: number, maxLevel: number): number {
  return level + (16 - maxLevel);
}

export function avgElixir(cards: Array<{ elixirCost?: number }>): number {
  if (cards.length === 0) return 0;
  return cards.reduce((sum, c) => sum + (c.elixirCost ?? 0), 0) / cards.length;
}

const BEATDOWN_TANKS = ['Golem', 'Lava Hound', 'Electro Giant', 'Giant', 'Goblin Giant'];

export function deckArchetype(cards: Array<{ name: string; elixirCost?: number }>): string {
  const avg = avgElixir(cards);
  const hasTank = cards.some((c) => BEATDOWN_TANKS.includes(c.name));
  return hasTank && avg >= 3.8 ? 'Beatdown' : avg <= 3.2 ? 'Cycle' : 'Control';
}

/** In-game slots are positional: 1 = evo, 2 = hero, 3 = whichever is left. */
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
