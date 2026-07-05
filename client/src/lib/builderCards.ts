// The card view model the War Deck Builder and its picker work with: the
// catalog merged with the player's ownership (levels + unlocked evo/hero tier).
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
  /** The card CAN be a hero (lists it under Hero & Champion). */
  isHero?: boolean;
  /** The player owns the evo tier (evolutionLevel >= 1). */
  hasEvo?: boolean;
  /** The player owns the hero tier (evolutionLevel >= 2). */
  ownsHero?: boolean;
  iconUrls?: CardIconUrls;
}

/**
 * Which special art a card placed in a given slot can show, gated by what the
 * player owns (and by the art existing). The evo slot only offers evo, the
 * hero slot only hero; the "both" slot offers whichever the player owns, and
 * when they own both, the UI shows a toggle to pick.
 */
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
