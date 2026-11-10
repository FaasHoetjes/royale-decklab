import { describe, expect, test } from 'bun:test';
import { cardSlug, cardType, mostPlayedVersion, specialVersions } from './cardInfo';

describe('cardSlug', () => {
  test('lowercases and hyphenates, dropping the dots of initials', () => {
    expect(cardSlug('Valkyrie')).toBe('valkyrie');
    expect(cardSlug('Mini P.E.K.K.A')).toBe('mini-pekka');
    expect(cardSlug('P.E.K.K.A')).toBe('pekka');
    expect(cardSlug('X-Bow')).toBe('x-bow');
    expect(cardSlug('Royal Giant')).toBe('royal-giant');
  });
});

describe('cardType', () => {
  test('reads the type from the id range', () => {
    expect(cardType(26000011)).toBe('Troop');
    expect(cardType(27000008)).toBe('Building');
    expect(cardType(28000000)).toBe('Spell');
    expect(cardType(27000010)).toBe('Troop');
    expect(cardType(28000016)).toBe('Troop');
  });
});

describe('specialVersions', () => {
  test('reads the Evo and Hero bits', () => {
    expect(specialVersions(undefined)).toEqual({ evo: false, hero: false });
    expect(specialVersions(1)).toEqual({ evo: true, hero: false });
    expect(specialVersions(2)).toEqual({ evo: false, hero: true });
    expect(specialVersions(3)).toEqual({ evo: true, hero: true });
  });
});

describe('mostPlayedVersion', () => {
  test('picks the version with the biggest share', () => {
    expect(mostPlayedVersion({ evoShare: 0.45, heroShare: 0.41 })).toBe('evo');
    expect(mostPlayedVersion({ evoShare: 0.2, heroShare: 0.5 })).toBe('hero');
    expect(mostPlayedVersion({ evoShare: 0.2, heroShare: 0.1 })).toBe('normal');
    expect(mostPlayedVersion(undefined)).toBe('normal');
  });
});
