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
