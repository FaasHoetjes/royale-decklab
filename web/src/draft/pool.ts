// Role-based 36-card pool generation (§3). Not pure randomness: each role bucket
// is filled to a target before the pool is topped up, with archetype-family caps
// for variety and a champion cap. A generated pool that fails validation is
// re-rolled; persistent failure falls back to the known-good safePool().

import type { Bucket, CardTag } from './types';
import { CARD_TAGS } from '../data/cardTags';
import { randInt, shuffle, type Rng } from './rng';
import { validatePool, safePool } from './validate';

const MAX_SPECIAL = 2;        // champions cap
const MAX_PER_FAMILY = 2;     // win-condition archetype cap

// Buckets are filled in this order with a target count drawn from a range. Mins
// sum to ~30 and cards count toward multiple buckets, so all targets are reached
// well under 36, leaving room for the top-up pass.
const FILL_ORDER: [Bucket, [number, number]][] = [
  ['winCondition', [5, 6]],
  ['antiAir', [5, 6]],
  ['building', [3, 4]],
  ['antiTank', [3, 4]],
  ['tankMiniTank', [3, 4]],
  ['bigSpell', [2, 2]],
  ['smallSpell', [3, 4]],
  ['cycleSupport', [6, 7]],
];

function generateOnce(rng: Rng): CardTag[] {
  const chosen = new Map<number, CardTag>();
  const familyCount: Record<string, number> = {};

  const specialCount = () => [...chosen.values()].filter(c => c.champion).length;
  const bucketCount = (b: Bucket) => [...chosen.values()].filter(c => c.buckets.includes(b)).length;

  const canAdd = (c: CardTag): boolean => {
    if (chosen.has(c.id) || chosen.size >= 36) return false;
    if (c.champion && specialCount() >= MAX_SPECIAL) return false;
    if (c.winCondition && c.archetype && (familyCount[c.archetype] || 0) >= MAX_PER_FAMILY) return false;
    return true;
  };

  const add = (c: CardTag) => {
    chosen.set(c.id, c);
    if (c.winCondition && c.archetype) familyCount[c.archetype] = (familyCount[c.archetype] || 0) + 1;
  };

  const shuffled = shuffle(CARD_TAGS, rng);

  for (const [bucket, [min, max]] of FILL_ORDER) {
    const target = randInt(rng, min, max);
    for (const c of shuffled) {
      if (bucketCount(bucket) >= target) break;
      if (c.buckets.includes(bucket) && canAdd(c)) add(c);
    }
  }

  // Top up to exactly 36 with anything still addable (champion / family caps
  // still apply). The shuffle makes this a varied fill.
  for (const c of shuffled) {
    if (chosen.size >= 36) break;
    if (canAdd(c)) add(c);
  }

  return [...chosen.values()];
}

/**
 * Generate a validated 36-card pool. Re-rolls up to `maxAttempts` times if the
 * pool fails the fairness checks, then falls back to the safe pool.
 */
export function generatePool(rng: Rng = Math.random, maxAttempts = 25): CardTag[] {
  for (let i = 0; i < maxAttempts; i++) {
    const pool = generateOnce(rng);
    if (validatePool(pool).ok) return pool;
  }
  return safePool();
}
