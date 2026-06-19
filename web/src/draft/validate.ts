// Pool fairness validator (§4) + a known-good fallback pool.
//
// Generation proposes, validation disposes: a generated pool that fails any
// check is re-rolled; if it keeps failing we fall back to SAFE_POOL so a player
// never sees a broken draft.

import type { CardTag } from './types';
import { CARD_TAGS } from '../data/cardTags';

export interface PoolValidation {
  ok: boolean;
  reasons: string[];
}

export function validatePool(pool: CardTag[]): PoolValidation {
  const reasons: string[] = [];

  if (pool.length !== 36) reasons.push(`pool has ${pool.length} cards, expected 36`);

  const count = (pred: (c: CardTag) => boolean) => pool.filter(pred).length;

  // No impossible defensive gap vs air.
  if (count(c => !!c.targetsAir) < 5) reasons.push('fewer than 5 anti-air cards');

  // Both sides can build a real offense, with variety.
  const winCons = pool.filter(c => c.winCondition);
  if (winCons.length < 5) reasons.push('fewer than 5 win conditions');
  const families = new Set(winCons.map(c => c.archetype).filter(Boolean));
  if (families.size < 3) reasons.push('fewer than 3 distinct win-condition families');

  // No one-sided archetype bias.
  const familyCounts: Record<string, number> = {};
  for (const w of winCons) {
    if (w.archetype) familyCounts[w.archetype] = (familyCounts[w.archetype] || 0) + 1;
  }
  for (const [fam, n] of Object.entries(familyCounts)) {
    if (n > 2) reasons.push(`too many "${fam}" win conditions (${n})`);
  }

  // Swarm / building answers exist.
  if (count(c => c.spellSize === 'small') < 2) reasons.push('fewer than 2 small spells');
  if (count(c => c.spellSize === 'big') < 1) reasons.push('no big spell');

  // Beatdown is answerable.
  if (count(c => c.buckets.includes('antiTank')) < 3) reasons.push('fewer than 3 anti-tank cards');

  // Cycling is possible — pool isn't all-expensive.
  if (count(c => c.elixir <= 3) < 8) reasons.push('fewer than 8 cheap (<=3 elixir) cards');

  return { ok: reasons.length === 0, reasons };
}

/**
 * A hand-picked 36-card pool that is guaranteed to pass validatePool. Used as
 * the fallback when generation can't produce a valid pool. Listed by card id.
 */
const SAFE_POOL_IDS: number[] = [
  // win conditions (cycle x2, beatdown, siege, bait x2)
  26000021 /* Hog Rider */, 26000003 /* Giant */, 26000006 /* Balloon */,
  27000008 /* X-Bow */, 28000004 /* Goblin Barrel */, 28000010 /* Graveyard */,
  // buildings
  27000003 /* Inferno Tower */, 27000000 /* Cannon */, 27000006 /* Tesla */,
  // big spells
  28000000 /* Fireball */, 28000003 /* Rocket */,
  // small spells
  28000008 /* Zap */, 28000011 /* The Log */, 28000001 /* Arrows */,
  // anti-air troops
  26000014 /* Musketeer */, 26000001 /* Archers */, 26000005 /* Minions */,
  26000039 /* Mega Minion */, 26000042 /* Electro Wizard */, 26000015 /* Baby Dragon */,
  // anti-tank
  26000018 /* Mini P.E.K.K.A */, 26000004 /* P.E.K.K.A */, 26000012 /* Skeleton Army */,
  // tanks / mini-tanks
  26000000 /* Knight */, 26000011 /* Valkyrie */, 26000038 /* Ice Golem */,
  // cycle / support
  26000010 /* Skeletons */, 26000030 /* Ice Spirit */, 26000002 /* Goblins */,
  26000049 /* Bats */, 26000064 /* Firecracker */, 26000013 /* Bomber */,
  // extra coverage
  26000017 /* Wizard */, 26000022 /* Minion Horde */, 26000025 /* Guards */, 26000031 /* Fire Spirit */,
];

export function safePool(): CardTag[] {
  const byId = new Map(CARD_TAGS.map(c => [c.id, c]));
  return SAFE_POOL_IDS.map(id => byId.get(id)).filter((c): c is CardTag => !!c);
}
