import type { SeasonBoosts } from '../api';
import type { BuilderCard } from './builderCards';
import { MAX_DISPLAY_LEVEL } from './cardDisplay';

/** The cards at the levels the generator scores them at: boosted ones lifted to the boost's level. */
export const withSeasonBoosts = (cards: BuilderCard[], boosts: SeasonBoosts): BuilderCard[] => {
  const boosted = new Set(boosts.cardIds);
  return cards.map((card) => {
    const { maxLevel } = card;
    const isLifted = card.owned && boosted.has(card.id) && maxLevel != null;
    if (!isLifted) return card;
    return { ...card, level: boosts.level - (MAX_DISPLAY_LEVEL - maxLevel), isBoosted: true };
  });
};

/** "Giant", "Giant and Mortar", "Giant, Mortar and Mirror". */
export const listNames = (names: string[]): string => {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};
