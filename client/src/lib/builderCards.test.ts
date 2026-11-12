import { describe, expect, test } from 'bun:test';
import type { CatalogCard } from '../api';
import { maxedCollection, toBuilderCards } from './builderCards';
import { unownedNote } from './builderDecks';

const catalog: CatalogCard[] = [
  { id: 1, name: 'Knight', maxLevel: 16, maxEvolutionLevel: 3, rarity: 'common', iconUrls: { medium: 'k', evolutionMedium: 'k-evo', heroMedium: 'k-hero' } },
  { id: 2, name: 'Mini P.E.K.K.A', maxLevel: 14, maxEvolutionLevel: 2, rarity: 'rare', iconUrls: { medium: 'p', heroMedium: 'p-hero' } },
  { id: 3, name: 'Minion Giant', maxLevel: 11, rarity: 'epic', iconUrls: { medium: 'mg' } },
];

describe('maxedCollection', () => {
  const cards = toBuilderCards(catalog, maxedCollection(catalog));

  test('owns every card at its max level', () => {
    expect(cards.map((c) => [c.owned, c.level, c.maxLevel])).toEqual([
      [true, 16, 16],
      [true, 14, 14],
      [true, 11, 11],
    ]);
  });

  test('unlocks exactly the Evolutions and Heroes a card has', () => {
    expect(cards.map((c) => [c.hasEvo, c.ownsHero])).toEqual([
      [true, true],
      [false, true],
      [false, false],
    ]);
  });

  test('takes Hero art from the catalog', () => {
    expect(cards.map((c) => c.iconUrls?.heroMedium)).toEqual(['k-hero', 'p-hero', undefined]);
  });
});

describe('unownedNote', () => {
  const [knight, pekka, giant] = toBuilderCards(catalog, []);

  test('names the one card you are missing', () => {
    expect(unownedNote([giant!])).toBe("Not scored: you don't own Minion Giant");
  });

  test('counts from two missing cards up', () => {
    expect(unownedNote([knight!, pekka!])).toBe("Not scored: 2 cards you don't own");
    expect(unownedNote([knight!, pekka!, giant!])).toBe("Not scored: 3 cards you don't own");
  });
});
