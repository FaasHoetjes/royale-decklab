import type { CardVersion } from './cardDisplay';

/** "Mini P.E.K.K.A" becomes "mini-pekka", for readable card page URLs. */
export function cardSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const cardPath = (name: string) => `/cards/${cardSlug(name)}`;

export type CardType = 'Troop' | 'Building' | 'Spell';

/** The CR API numbers troops 26xxxxxx, buildings 27xxxxxx and spells 28xxxxxx. */
export function cardType(id: number): CardType {
  const group = Math.floor(id / 1_000_000);
  return group === 27 ? 'Building' : group === 28 ? 'Spell' : 'Troop';
}

/** `maxEvolutionLevel` is a bitmask like a player's evolutionLevel: 1 = has an Evo, 2 = has a Hero. */
export function specialVersions(maxEvolutionLevel: number | undefined): { evo: boolean; hero: boolean } {
  const bits = maxEvolutionLevel ?? 0;
  return { evo: (bits & 1) !== 0, hero: (bits & 2) !== 0 };
}

/** The version a card is played as most often, which is the art that represents it best. */
export function mostPlayedVersion(stat: { evoShare: number; heroShare: number } | undefined): CardVersion {
  if (!stat) return 'normal';
  const normalShare = 1 - stat.evoShare - stat.heroShare;
  if (stat.evoShare >= stat.heroShare && stat.evoShare > normalShare) return 'evo';
  if (stat.heroShare > normalShare) return 'hero';
  return 'normal';
}
