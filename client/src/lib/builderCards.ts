import type { CatalogCard, OwnedCard } from '../api';
import type { CardIconUrls } from './cardDisplay';
import type { SpecialVersion } from './deckBoard';
import type { SlotKind } from './slotStyles';

export interface BuilderCard {
  id: number;
  name: string;
  elixirCost?: number;
  rarity?: string;
  owned: boolean;
  level?: number;
  maxLevel?: number;
  isHero?: boolean;
  hasEvo?: boolean;
  ownsHero?: boolean;
  iconUrls?: CardIconUrls;
}

export function availableVersions(card: BuilderCard, kind: SlotKind | null): SpecialVersion[] {
  const canEvo = !!card.hasEvo && !!card.iconUrls?.evolutionMedium;
  const canHero = !!card.ownsHero && !!card.iconUrls?.heroMedium;
  if (kind === 'evo') return canEvo ? ['evo'] : [];
  if (kind === 'hero') return canHero ? ['hero'] : [];
  if (kind === 'both') {
    const versions: SpecialVersion[] = [];
    if (canEvo) versions.push('evo');
    if (canHero) versions.push('hero');
    return versions;
  }
  return [];
}

/** The full catalog, marked with what the player owns (level, unlocked Evo/Hero). */
export function toBuilderCards(catalog: CatalogCard[], owned: OwnedCard[]): BuilderCard[] {
  const ownedById = new Map(owned.map((c) => [c.id, c]));
  return catalog.map((c) => {
    const ownedCard = ownedById.get(c.id);
    return {
      id: c.id,
      name: c.name,
      elixirCost: c.elixirCost,
      rarity: c.rarity,
      owned: !!ownedCard,
      level: ownedCard?.level,
      maxLevel: ownedCard?.maxLevel ?? c.maxLevel,
      isHero: !!ownedCard?.iconUrls?.heroMedium || (c.maxEvolutionLevel ?? 0) >= 2,
      // Ownership: the per-player evolutionLevel is a bitmask (1 = evo, 2 = hero, 3 = both).
      hasEvo: ((ownedCard?.evolutionLevel ?? 0) & 1) !== 0,
      ownsHero: ((ownedCard?.evolutionLevel ?? 0) & 2) !== 0,
      iconUrls: {
        medium: c.iconUrls?.medium,
        evolutionMedium: c.iconUrls?.evolutionMedium,
        heroMedium: ownedCard?.iconUrls?.heroMedium,
      },
    };
  });
}
