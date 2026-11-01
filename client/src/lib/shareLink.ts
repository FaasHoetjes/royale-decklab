// A shared lineup travels in the link as `?share=`: each card as two base-36 characters, decks joined by dots.
// Card ids are 26/27/28 million (troops, buildings, spells) plus a small number, so two characters per card
// keep a four-deck link around 70 characters where the generator's `lock` parameters would take 300.

import { MAX_DECKS } from './generatorOptions';

const CARDS_PER_DECK = 8;
const PER_TYPE = 432;
const FIRST_TYPE = 26;
const TYPES = 3;

function encodeCard(id: number): string | null {
  const type = Math.floor(id / 1_000_000) - FIRST_TYPE;
  const n = id % 1_000_000;
  if (!Number.isInteger(id) || type < 0 || type >= TYPES || n >= PER_TYPE) return null;
  return (type * PER_TYPE + n).toString(36).padStart(2, '0');
}

/** Null when a card falls outside the compact range, so the caller can share the plain player link instead. */
export function encodeShare(decks: number[][]): string | null {
  const parts: string[] = [];
  for (const deck of decks) {
    const codes = deck.map(encodeCard);
    if (codes.some((c) => c == null)) return null;
    parts.push(codes.join(''));
  }
  return parts.join('.');
}

/** The shared decks in order, or null for anything that isn't a valid lineup (hand-edited or cut-off links). */
export function decodeShare(raw: string | null): number[][] | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length > MAX_DECKS) return null;
  const seen = new Set<number>();
  const decks: number[][] = [];
  for (const part of parts) {
    if (!/^[0-9a-z]{16}$/.test(part)) return null;
    const deck: number[] = [];
    for (let i = 0; i < CARDS_PER_DECK; i++) {
      const k = parseInt(part.slice(i * 2, i * 2 + 2), 36);
      if (k >= TYPES * PER_TYPE) return null;
      const id = (FIRST_TYPE + Math.floor(k / PER_TYPE)) * 1_000_000 + (k % PER_TYPE);
      if (seen.has(id)) return null;
      seen.add(id);
      deck.push(id);
    }
    decks.push(deck);
  }
  return decks;
}
