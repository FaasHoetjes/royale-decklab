// Curated card metadata for the Mega Draft gamemode.
//
// This is the self-owned dataset that powers BOTH pool generation (§3) and the
// counter/scoring engine (§5). It is keyed by the real Clash Royale card id
// (from the official API: 26xxxxxx = troops, 27xxxxxx = buildings, 28xxxxxx =
// spells) so we can join card art at runtime without re-listing names.
//
// Authoring is deliberately terse: only `true` flags are written; everything
// omitted defaults to false. Tags are a pragmatic first pass — accurate enough
// for scoring to feel right, and meant to be tuned via the sim harness later
// (see the plan's "Next steps"). Mirror is intentionally absent: it has no fixed
// elixir cost and copies a card, which doesn't fit a draft pool.

import type { CardTag } from '../draft/types';

export const CARD_TAGS: CardTag[] = [
  // ---- Troops (26xxxxxx) ----
  { id: 26000000, name: 'Knight', elixir: 3, buckets: ['tankMiniTank', 'cycleSupport'] },
  { id: 26000001, name: 'Archers', elixir: 3, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, ranged: true },
  { id: 26000002, name: 'Goblins', elixir: 2, buckets: ['cycleSupport', 'antiTank'], swarm: true },
  { id: 26000003, name: 'Giant', elixir: 5, buckets: ['winCondition', 'tankMiniTank'], winCondition: true, tank: true, archetype: 'beatdown' },
  { id: 26000004, name: 'P.E.K.K.A', elixir: 7, buckets: ['antiTank', 'tankMiniTank'], tank: true },
  { id: 26000005, name: 'Minions', elixir: 3, buckets: ['antiAir', 'cycleSupport'], air: true, targetsAir: true, swarm: true },
  { id: 26000006, name: 'Balloon', elixir: 5, buckets: ['winCondition'], winCondition: true, air: true, archetype: 'cycle' },
  { id: 26000007, name: 'Witch', elixir: 5, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true, swarm: true },
  { id: 26000008, name: 'Barbarians', elixir: 5, buckets: ['antiTank', 'cycleSupport'], swarm: true },
  { id: 26000009, name: 'Golem', elixir: 8, buckets: ['winCondition', 'tankMiniTank'], winCondition: true, tank: true, archetype: 'beatdown' },
  { id: 26000010, name: 'Skeletons', elixir: 1, buckets: ['cycleSupport'], swarm: true },
  { id: 26000011, name: 'Valkyrie', elixir: 4, buckets: ['tankMiniTank', 'cycleSupport'], splash: true },
  { id: 26000012, name: 'Skeleton Army', elixir: 3, buckets: ['antiTank', 'cycleSupport'], swarm: true },
  { id: 26000013, name: 'Bomber', elixir: 2, buckets: ['cycleSupport'], splash: true, ranged: true },
  { id: 26000014, name: 'Musketeer', elixir: 4, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, ranged: true },
  { id: 26000015, name: 'Baby Dragon', elixir: 4, buckets: ['antiAir', 'cycleSupport'], air: true, targetsAir: true, splash: true },
  { id: 26000016, name: 'Prince', elixir: 5, buckets: ['antiTank', 'tankMiniTank'] },
  { id: 26000017, name: 'Wizard', elixir: 5, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true },
  { id: 26000018, name: 'Mini P.E.K.K.A', elixir: 4, buckets: ['antiTank'] },
  { id: 26000019, name: 'Spear Goblins', elixir: 2, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, ranged: true, swarm: true },
  { id: 26000020, name: 'Giant Skeleton', elixir: 6, buckets: ['tankMiniTank'], tank: true, splash: true },
  { id: 26000021, name: 'Hog Rider', elixir: 4, buckets: ['winCondition'], winCondition: true, archetype: 'cycle' },
  { id: 26000022, name: 'Minion Horde', elixir: 5, buckets: ['antiAir', 'cycleSupport'], air: true, targetsAir: true, swarm: true },
  { id: 26000023, name: 'Ice Wizard', elixir: 3, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true },
  { id: 26000024, name: 'Royal Giant', elixir: 6, buckets: ['winCondition'], winCondition: true, ranged: true, archetype: 'cycle' },
  { id: 26000025, name: 'Guards', elixir: 3, buckets: ['antiTank', 'cycleSupport'], swarm: true },
  { id: 26000026, name: 'Princess', elixir: 3, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true },
  { id: 26000027, name: 'Dark Prince', elixir: 4, buckets: ['tankMiniTank', 'cycleSupport'], splash: true },
  { id: 26000028, name: 'Three Musketeers', elixir: 9, buckets: ['antiAir'], targetsAir: true, ranged: true },
  { id: 26000029, name: 'Lava Hound', elixir: 7, buckets: ['winCondition', 'tankMiniTank'], winCondition: true, air: true, tank: true, archetype: 'beatdown' },
  { id: 26000030, name: 'Ice Spirit', elixir: 1, buckets: ['cycleSupport'], targetsAir: true },
  { id: 26000031, name: 'Fire Spirit', elixir: 1, buckets: ['cycleSupport'], targetsAir: true, splash: true },
  { id: 26000032, name: 'Miner', elixir: 3, buckets: ['winCondition', 'tankMiniTank'], winCondition: true, archetype: 'cycle' },
  { id: 26000033, name: 'Sparky', elixir: 6, buckets: ['antiTank'], splash: true, ranged: true },
  { id: 26000034, name: 'Bowler', elixir: 5, buckets: ['cycleSupport'], splash: true, ranged: true },
  { id: 26000035, name: 'Lumberjack', elixir: 4, buckets: ['antiTank', 'tankMiniTank'] },
  { id: 26000036, name: 'Battle Ram', elixir: 4, buckets: ['winCondition'], winCondition: true, archetype: 'spam' },
  { id: 26000037, name: 'Inferno Dragon', elixir: 4, buckets: ['antiTank', 'antiAir'], air: true, targetsAir: true },
  { id: 26000038, name: 'Ice Golem', elixir: 2, buckets: ['tankMiniTank', 'cycleSupport'] },
  { id: 26000039, name: 'Mega Minion', elixir: 3, buckets: ['antiAir', 'cycleSupport'], air: true, targetsAir: true },
  { id: 26000040, name: 'Dart Goblin', elixir: 3, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, ranged: true },
  { id: 26000041, name: 'Goblin Gang', elixir: 3, buckets: ['antiAir', 'antiTank', 'cycleSupport'], targetsAir: true, swarm: true },
  { id: 26000042, name: 'Electro Wizard', elixir: 4, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true },
  { id: 26000043, name: 'Elite Barbarians', elixir: 6, buckets: ['antiTank', 'cycleSupport'], swarm: true },
  { id: 26000044, name: 'Hunter', elixir: 4, buckets: ['antiTank', 'antiAir'], targetsAir: true, splash: true },
  { id: 26000045, name: 'Executioner', elixir: 5, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true },
  { id: 26000046, name: 'Bandit', elixir: 3, buckets: ['tankMiniTank', 'cycleSupport'] },
  { id: 26000047, name: 'Royal Recruits', elixir: 7, buckets: ['tankMiniTank'], swarm: true },
  { id: 26000048, name: 'Night Witch', elixir: 4, buckets: ['cycleSupport', 'antiTank'] },
  { id: 26000049, name: 'Bats', elixir: 2, buckets: ['antiAir', 'cycleSupport'], air: true, targetsAir: true, swarm: true },
  { id: 26000050, name: 'Royal Ghost', elixir: 3, buckets: ['tankMiniTank', 'cycleSupport'], splash: true },
  { id: 26000051, name: 'Ram Rider', elixir: 5, buckets: ['winCondition'], winCondition: true, archetype: 'spam' },
  { id: 26000052, name: 'Zappies', elixir: 4, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true },
  { id: 26000053, name: 'Rascals', elixir: 5, buckets: ['tankMiniTank', 'antiAir'], targetsAir: true, ranged: true, swarm: true },
  { id: 26000054, name: 'Cannon Cart', elixir: 5, buckets: ['tankMiniTank'], ranged: true },
  { id: 26000055, name: 'Mega Knight', elixir: 7, buckets: ['tankMiniTank', 'antiTank'], tank: true, splash: true },
  { id: 26000056, name: 'Skeleton Barrel', elixir: 3, buckets: ['winCondition'], winCondition: true, air: true, archetype: 'bait' },
  { id: 26000057, name: 'Flying Machine', elixir: 4, buckets: ['antiAir'], air: true, targetsAir: true, ranged: true },
  { id: 26000058, name: 'Wall Breakers', elixir: 2, buckets: ['winCondition'], winCondition: true, archetype: 'cycle' },
  { id: 26000059, name: 'Royal Hogs', elixir: 5, buckets: ['winCondition'], winCondition: true, archetype: 'cycle' },
  { id: 26000060, name: 'Goblin Giant', elixir: 6, buckets: ['winCondition', 'tankMiniTank'], winCondition: true, tank: true, archetype: 'beatdown' },
  { id: 26000061, name: 'Fisherman', elixir: 3, buckets: ['antiTank', 'cycleSupport'] },
  { id: 26000062, name: 'Magic Archer', elixir: 4, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true },
  { id: 26000063, name: 'Electro Dragon', elixir: 5, buckets: ['antiAir'], air: true, targetsAir: true, splash: true },
  { id: 26000064, name: 'Firecracker', elixir: 3, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true },
  { id: 26000065, name: 'Mighty Miner', elixir: 4, buckets: ['antiTank', 'tankMiniTank', 'special'], champion: true },
  { id: 26000067, name: 'Elixir Golem', elixir: 3, buckets: ['winCondition', 'tankMiniTank'], winCondition: true, tank: true, archetype: 'beatdown' },
  { id: 26000068, name: 'Battle Healer', elixir: 4, buckets: ['tankMiniTank', 'cycleSupport'] },
  { id: 26000069, name: 'Skeleton King', elixir: 4, buckets: ['tankMiniTank', 'special'], tank: true, champion: true },
  { id: 26000072, name: 'Archer Queen', elixir: 5, buckets: ['antiAir', 'antiTank', 'special'], targetsAir: true, ranged: true, champion: true },
  { id: 26000074, name: 'Golden Knight', elixir: 4, buckets: ['tankMiniTank', 'special'], champion: true },
  { id: 26000077, name: 'Monk', elixir: 5, buckets: ['tankMiniTank', 'antiTank', 'special'], tank: true, champion: true },
  { id: 26000080, name: 'Skeleton Dragons', elixir: 4, buckets: ['antiAir', 'cycleSupport'], air: true, targetsAir: true, splash: true },
  { id: 26000083, name: 'Mother Witch', elixir: 4, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true, ranged: true },
  { id: 26000084, name: 'Electro Spirit', elixir: 1, buckets: ['antiAir', 'cycleSupport'], targetsAir: true, splash: true },
  { id: 26000085, name: 'Electro Giant', elixir: 7, buckets: ['winCondition', 'tankMiniTank'], winCondition: true, tank: true, archetype: 'beatdown' },
  { id: 26000087, name: 'Phoenix', elixir: 4, buckets: ['antiAir', 'antiTank'], air: true, targetsAir: true },
  { id: 26000093, name: 'Little Prince', elixir: 3, buckets: ['antiAir', 'special'], targetsAir: true, ranged: true, champion: true },
  { id: 26000095, name: 'Goblin Demolisher', elixir: 4, buckets: ['tankMiniTank', 'antiTank'], ranged: true, splash: true },
  { id: 26000096, name: 'Goblin Machine', elixir: 5, buckets: ['tankMiniTank', 'antiTank', 'antiAir'], targetsAir: true, tank: true },
  { id: 26000097, name: 'Suspicious Bush', elixir: 2, buckets: ['cycleSupport'] },
  { id: 26000099, name: 'Goblinstein', elixir: 5, buckets: ['antiTank', 'special'], splash: true, champion: true },
  { id: 26000101, name: 'Rune Giant', elixir: 4, buckets: ['tankMiniTank', 'cycleSupport'] },
  { id: 26000102, name: 'Berserker', elixir: 2, buckets: ['tankMiniTank', 'cycleSupport'] },
  { id: 26000103, name: 'Boss Bandit', elixir: 6, buckets: ['tankMiniTank', 'antiTank', 'special'], tank: true, champion: true },

  // ---- Buildings (27xxxxxx) ----
  { id: 27000000, name: 'Cannon', elixir: 3, buckets: ['building', 'antiTank'], building: true },
  { id: 27000001, name: 'Goblin Hut', elixir: 4, buckets: ['building'], building: true },
  { id: 27000002, name: 'Mortar', elixir: 4, buckets: ['building', 'winCondition'], building: true, winCondition: true, archetype: 'siege' },
  { id: 27000003, name: 'Inferno Tower', elixir: 5, buckets: ['building', 'antiTank'], building: true, targetsAir: true },
  { id: 27000004, name: 'Bomb Tower', elixir: 4, buckets: ['building'], building: true, splash: true },
  { id: 27000005, name: 'Barbarian Hut', elixir: 6, buckets: ['building'], building: true },
  { id: 27000006, name: 'Tesla', elixir: 4, buckets: ['building', 'antiAir', 'antiTank'], building: true, targetsAir: true },
  { id: 27000007, name: 'Elixir Collector', elixir: 6, buckets: ['building'], building: true },
  { id: 27000008, name: 'X-Bow', elixir: 6, buckets: ['building', 'winCondition'], building: true, winCondition: true, archetype: 'siege' },
  { id: 27000009, name: 'Tombstone', elixir: 3, buckets: ['building', 'cycleSupport'], building: true },
  { id: 27000010, name: 'Furnace', elixir: 4, buckets: ['building'], building: true, splash: true },
  { id: 27000012, name: 'Goblin Cage', elixir: 4, buckets: ['building', 'antiTank'], building: true },
  { id: 27000013, name: 'Goblin Drill', elixir: 4, buckets: ['winCondition', 'building'], building: true, winCondition: true, archetype: 'siege' },

  // ---- Spells (28xxxxxx) ----
  { id: 28000000, name: 'Fireball', elixir: 4, buckets: ['bigSpell'], spellSize: 'big', splash: true, targetsAir: true },
  { id: 28000001, name: 'Arrows', elixir: 3, buckets: ['smallSpell'], spellSize: 'small', splash: true, targetsAir: true },
  { id: 28000002, name: 'Rage', elixir: 2, buckets: ['smallSpell'], spellSize: 'small' },
  { id: 28000003, name: 'Rocket', elixir: 6, buckets: ['bigSpell'], spellSize: 'big', splash: true, targetsAir: true },
  { id: 28000004, name: 'Goblin Barrel', elixir: 3, buckets: ['winCondition'], winCondition: true, archetype: 'bait' },
  { id: 28000005, name: 'Freeze', elixir: 4, buckets: ['smallSpell'], spellSize: 'small', targetsAir: true },
  { id: 28000007, name: 'Lightning', elixir: 6, buckets: ['bigSpell'], spellSize: 'big', splash: true, targetsAir: true },
  { id: 28000008, name: 'Zap', elixir: 2, buckets: ['smallSpell'], spellSize: 'small', splash: true, targetsAir: true },
  { id: 28000009, name: 'Poison', elixir: 4, buckets: ['bigSpell'], spellSize: 'big', splash: true, targetsAir: true },
  { id: 28000010, name: 'Graveyard', elixir: 5, buckets: ['winCondition'], winCondition: true, archetype: 'bait' },
  { id: 28000011, name: 'The Log', elixir: 2, buckets: ['smallSpell'], spellSize: 'small', splash: true },
  { id: 28000012, name: 'Tornado', elixir: 3, buckets: ['smallSpell'], spellSize: 'small', targetsAir: true },
  { id: 28000013, name: 'Clone', elixir: 3, buckets: ['smallSpell'], spellSize: 'small' },
  { id: 28000014, name: 'Earthquake', elixir: 3, buckets: ['smallSpell'], spellSize: 'small' },
  { id: 28000015, name: 'Barbarian Barrel', elixir: 2, buckets: ['smallSpell'], spellSize: 'small', splash: true },
  { id: 28000016, name: 'Heal Spirit', elixir: 1, buckets: ['cycleSupport'], targetsAir: true },
  { id: 28000017, name: 'Giant Snowball', elixir: 2, buckets: ['smallSpell'], spellSize: 'small', splash: true, targetsAir: true },
  { id: 28000018, name: 'Royal Delivery', elixir: 3, buckets: ['smallSpell'], spellSize: 'small', splash: true, targetsAir: true },
  { id: 28000023, name: 'Void', elixir: 3, buckets: ['bigSpell'], spellSize: 'big', splash: true, targetsAir: true },
  { id: 28000024, name: 'Goblin Curse', elixir: 2, buckets: ['smallSpell'], spellSize: 'small' },
  { id: 28000025, name: 'Spirit Empress', elixir: 6, buckets: ['antiAir'], air: true, targetsAir: true, splash: true, ranged: true },
  { id: 28000026, name: 'Vines', elixir: 3, buckets: ['smallSpell'], spellSize: 'small', targetsAir: true },
];

/**
 * Famous hard counters (the "authentic" layer over the role heuristic, §5).
 * When the candidate card answers an opponent card listed here, the base role
 * weight is multiplied by `mult`. Kept small and hand-curated; expand via
 * playtesting + the sim harness. Keyed by card name for readability.
 */
export interface HardCounter {
  /** The answering card. */
  counter: string;
  /** Opponent cards it hard-counters. */
  targets: string[];
  mult: number;
}

export const HARD_COUNTERS: HardCounter[] = [
  { counter: 'Inferno Tower', targets: ['Golem', 'Giant', 'Lava Hound', 'Electro Giant', 'Goblin Giant', 'Royal Giant', 'Mega Knight', 'Elixir Golem'], mult: 1.6 },
  { counter: 'Inferno Dragon', targets: ['Golem', 'Giant', 'Electro Giant', 'Goblin Giant', 'Mega Knight', 'P.E.K.K.A'], mult: 1.5 },
  { counter: 'P.E.K.K.A', targets: ['Golem', 'Electro Giant', 'Goblin Giant', 'Royal Giant', 'Mega Knight'], mult: 1.4 },
  { counter: 'Mini P.E.K.K.A', targets: ['Hog Rider', 'Giant', 'Royal Giant', 'Balloon'], mult: 1.4 },
  { counter: 'Skeleton Army', targets: ['Mini P.E.K.K.A', 'Prince', 'Hog Rider', 'P.E.K.K.A', 'Giant', 'Lumberjack'], mult: 1.4 },
  { counter: 'Minion Horde', targets: ['Giant', 'Golem', 'Royal Giant', 'Sparky'], mult: 1.5 },
  { counter: 'Rocket', targets: ['Three Musketeers', 'Elixir Collector', 'X-Bow', 'Mortar'], mult: 2.0 },
  { counter: 'Lightning', targets: ['Three Musketeers', 'Sparky', 'Inferno Tower', 'Electro Wizard'], mult: 1.8 },
  { counter: 'Fireball', targets: ['Three Musketeers', 'Wizard', 'Witch', 'Musketeer', 'Barbarians'], mult: 1.5 },
  { counter: 'Arrows', targets: ['Minion Horde', 'Goblin Gang', 'Skeleton Army', 'Princess', 'Goblin Barrel', 'Bats'], mult: 1.7 },
  { counter: 'The Log', targets: ['Goblin Barrel', 'Skeleton Army', 'Goblin Gang', 'Princess', 'Wall Breakers', 'Royal Hogs'], mult: 1.6 },
  { counter: 'Zap', targets: ['Minion Horde', 'Skeleton Army', 'Goblin Barrel', 'Bats', 'Inferno Dragon', 'Inferno Tower'], mult: 1.4 },
  { counter: 'Valkyrie', targets: ['Skeleton Army', 'Goblin Gang', 'Barbarians', 'Three Musketeers', 'Witch'], mult: 1.4 },
  { counter: 'Tornado', targets: ['Graveyard', 'Goblin Barrel', 'Skeleton Army', 'Barbarians'], mult: 1.4 },
  { counter: 'Tesla', targets: ['Hog Rider', 'Royal Giant', 'Balloon', 'Ram Rider'], mult: 1.4 },
  { counter: 'Cannon', targets: ['Hog Rider', 'Royal Giant', 'Battle Ram', 'Ram Rider'], mult: 1.4 },
  { counter: 'Bomb Tower', targets: ['Hog Rider', 'Goblin Giant', 'Barbarians', 'Skeleton Army'], mult: 1.3 },
  { counter: 'Phoenix', targets: ['Balloon', 'Lava Hound', 'Sparky'], mult: 1.3 },
  { counter: 'Electro Wizard', targets: ['Sparky', 'Inferno Dragon', 'Inferno Tower', 'Balloon'], mult: 1.4 },
  { counter: 'Fisherman', targets: ['Hog Rider', 'Balloon', 'Sparky', 'Royal Giant'], mult: 1.3 },
];
