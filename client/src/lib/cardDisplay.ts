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

/** Which version decides a card's slot: the meta deck's Evolution/Hero, else the player's own. */
export function slotVersionOf(
  metaVersions: CardVersionRef[] | undefined,
  playerVersions: CardVersionRef[] | undefined
): (cardId: number) => CardVersion {
  return (cardId) => {
    const meta = metaVersions?.find((v) => v.cardId === cardId)?.version;
    return meta && meta !== 'normal' ? meta : versionOf(playerVersions, cardId);
  };
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

export function inOrder<T extends { id: number }>(cards: T[], ids: number[]): T[] {
  return ids.map((id) => cards.find((c) => c.id === id)).filter((c): c is T => c !== undefined);
}

const SPECIAL_SLOTS: Record<CardVersion, number[]> = { evo: [0, 2], hero: [1, 2], normal: [] };

function placements(cards: number[], slots: number[][], taken: Set<number> = new Set()): number[][] {
  if (cards.length === 0) return [[]];
  const [first = [], ...rest] = slots;
  return first
    .filter((slot) => !taken.has(slot))
    .flatMap((slot) => placements(cards.slice(1), rest, new Set(taken).add(slot)).map((tail) => [slot, ...tail]));
}

/** Slot order for `cards` that keeps each card shared with `reference` in the same position where the slot rules allow. */
export function alignToReference<T extends { id: number }>(
  cards: T[],
  version: (cardId: number) => CardVersion,
  reference: Array<{ id: number }>
): T[] {
  const base = orderBySlots(cards, version);
  const refIndex = new Map(reference.map((c, i) => [c.id, i]));
  const specials = base.slice(0, 3).filter((c) => version(c.id) !== 'normal');
  const rest = base.filter((c) => !specials.includes(c));
  const backOnly = new Set(base.slice(3).filter((c) => version(c.id) !== 'normal'));

  let best: T[] = base;
  let bestScore = -1;
  for (const assignment of placements(specials.map((c) => c.id), specials.map((c) => SPECIAL_SLOTS[version(c.id)]))) {
    const result: Array<T | undefined> = new Array(base.length).fill(undefined);
    assignment.forEach((slot, i) => (result[slot] = specials[i]));
    const unplaced: T[] = [];
    for (const card of rest) {
      const want = refIndex.get(card.id);
      if (want !== undefined && want < result.length && !result[want] && !(backOnly.has(card) && want < 3)) result[want] = card;
      else unplaced.push(card);
    }
    for (const card of unplaced) {
      const from = backOnly.has(card) ? 3 : 0;
      const free = result.findIndex((c, i) => i >= from && !c);
      result[free] = card;
    }
    const score = result.filter((c, i) => c && reference[i]?.id === c.id).length;
    if (score > bestScore) {
      best = result as T[];
      bestScore = score;
    }
  }
  return best;
}
