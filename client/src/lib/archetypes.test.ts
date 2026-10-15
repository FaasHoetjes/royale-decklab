import { describe, expect, test } from 'bun:test';
import { classifyDeck } from './archetypes';

const COST: Record<string, number> = {
  'Archer Queen': 5, Archers: 3, Arrows: 3, 'Baby Dragon': 4, Balloon: 5, Bandit: 3, 'Barbarian Barrel': 2,
  Barbarians: 5, 'Battle Ram': 4, Bats: 2, Berserker: 2, Bowler: 5, Cannon: 3, 'Cannon Cart': 5,
  'Dart Goblin': 3, Earthquake: 3, 'Electro Dragon': 5, 'Electro Spirit': 1, 'Electro Wizard': 4,
  'Elite Barbarians': 6, 'Elixir Collector': 6, Executioner: 5, Fireball: 4, Firecracker: 3, Fisherman: 3,
  'Flying Machine': 4, Freeze: 4, 'Giant Skeleton': 6, 'Giant Snowball': 2, Giant: 5, 'Goblin Barrel': 3,
  'Goblin Cage': 4, 'Goblin Gang': 3, Golem: 8, 'Golden Knight': 4, Graveyard: 5, Guards: 3, 'Hog Rider': 4,
  Hunter: 4, 'Ice Golem': 2, 'Ice Spirit': 1, 'Ice Wizard': 3, 'Inferno Dragon': 4, 'Inferno Tower': 5,
  Knight: 3, 'Lava Hound': 7, Lumberjack: 4, 'Magic Archer': 4, 'Mega Knight': 7, 'Mega Minion': 3,
  'Mighty Miner': 4, 'Mini P.E.K.K.A': 4, Miner: 3, Minions: 3, 'Mother Witch': 4, Mortar: 4, Musketeer: 4,
  'Night Witch': 4, 'P.E.K.K.A': 7, Phoenix: 4, Poison: 4, Prince: 5, Princess: 3, Rascals: 5, Rocket: 6,
  'Royal Delivery': 3, 'Royal Ghost': 3, 'Royal Giant': 6, 'Royal Hogs': 5, 'Royal Recruits': 7,
  'Skeleton Army': 3, 'Skeleton Barrel': 3, 'Skeleton Dragons': 4, 'Skeleton King': 4, Skeletons: 1,
  'Suspicious Bush': 2, Tesla: 4, 'The Log': 2, Tombstone: 3, Tornado: 3, Valkyrie: 4, Vines: 3,
  'Wall Breakers': 2, Witch: 5, Wizard: 5, 'X-Bow': 6, Zap: 2, Zappies: 4, Bomber: 2, Goblins: 2, 'Spear Goblins': 2, Furnace: 4, Lightning: 6,
};

function classify(names: string[]) {
  return classifyDeck(names.map((name) => ({ name, elixirCost: COST[name] })));
}

// Real decks from the most-played war decks in the meta.
describe('classifyDeck', () => {
  test.each([
    ['Hog 2.6', 'Cycle', ['Skeletons', 'Musketeer', 'Hog Rider', 'Ice Spirit', 'Ice Golem', 'Cannon', 'Fireball', 'The Log']],
    ['Hog EQ', 'Cycle', ['Skeletons', 'Hog Rider', 'Firecracker', 'Mighty Miner', 'Electro Spirit', 'Tesla', 'The Log', 'Earthquake']],
    ['Log Bait', 'Bait', ['Knight', 'Princess', 'Ice Spirit', 'Goblin Gang', 'Inferno Tower', 'Rocket', 'Goblin Barrel', 'The Log']],
    ['Log Bait', 'Bait', ['Valkyrie', 'Skeleton Army', 'Princess', 'Ice Spirit', 'Dart Goblin', 'Wall Breakers', 'Cannon', 'Goblin Barrel']],
    ['PEKKA Bridge Spam', 'Bridge Spam', ['P.E.K.K.A', 'Battle Ram', 'Electro Wizard', 'Bandit', 'Royal Ghost', 'Magic Archer', 'Zap', 'Poison']],
    ['Royal Hogs Recruits', 'Bridge Spam', ['Royal Recruits', 'Zappies', 'Flying Machine', 'Royal Hogs', 'Electro Spirit', 'Goblin Cage', 'Arrows', 'Barbarian Barrel']],
    ['Royal Hogs EQ', 'Cycle', ['Skeletons', 'Ice Spirit', 'Royal Hogs', 'Archer Queen', 'Cannon', 'The Log', 'Earthquake', 'Royal Delivery']],
    ['Mortar Bait', 'Siege', ['Minions', 'Rascals', 'Cannon Cart', 'Skeleton Barrel', 'Berserker', 'Mortar', 'Fireball', 'Barbarian Barrel']],
    ['Splashyard', 'Control', ['Knight', 'Baby Dragon', 'Ice Wizard', 'Tombstone', 'Poison', 'Graveyard', 'Tornado', 'Barbarian Barrel']],
    ['Graveyard Freeze', 'Control', ['Bowler', 'Inferno Dragon', 'Executioner', 'Zappies', 'Golden Knight', 'Freeze', 'Graveyard', 'Tornado']],
    ['Giant Graveyard', 'Beatdown', ['Giant', 'Minions', 'Witch', 'Mini P.E.K.K.A', 'Bowler', 'Arrows', 'Graveyard', 'Giant Snowball']],
    ['Lumberloon', 'Control', ['Balloon', 'Bowler', 'Lumberjack', 'Inferno Dragon', 'Electro Dragon', 'Freeze', 'Tornado', 'Barbarian Barrel']],
    ['Lava Loon', 'Beatdown', ['Balloon', 'Valkyrie', 'Guards', 'Lava Hound', 'Inferno Dragon', 'Skeleton Dragons', 'Fireball', 'Zap']],
    ['Golem Beatdown', 'Beatdown', ['Golem', 'Bomber', 'Mini P.E.K.K.A', 'Elite Barbarians', 'Night Witch', 'Phoenix', 'Arrows', 'Zap']],
    ['Royal Giant Fisherman', 'Cycle', ['Skeletons', 'Royal Giant', 'Hunter', 'Royal Ghost', 'Fisherman', 'Electro Spirit', 'Fireball', 'Barbarian Barrel']],
    ['X-Bow Cycle', 'Siege', ['Knight', 'Archers', 'Skeletons', 'Electro Spirit', 'Tesla', 'X-Bow', 'Fireball', 'The Log']],
    ['Bridge Spam', 'Bridge Spam', ['Wizard', 'Giant Skeleton', 'Battle Ram', 'Royal Ghost', 'Zappies', 'Mother Witch', 'Barbarian Barrel', 'Vines']],
    ['Mega Knight Wall Breakers', 'Control', ['Prince', 'Goblin Gang', 'Bandit', 'Bats', 'Mega Knight', 'Wall Breakers', 'Archer Queen', 'Arrows']],
    ['Mega Knight Miner', 'Control', ['Spear Goblins', 'Miner', 'Inferno Dragon', 'Goblin Gang', 'Bats', 'Mega Knight', 'Skeleton Barrel', 'Zap']],
    ['Skeleton Barrel Bait', 'Bait', ['Skeleton Army', 'Dart Goblin', 'Rascals', 'Skeleton Barrel', 'Skeleton King', 'Suspicious Bush', 'Cannon', 'Vines']],
  ] as const)('%s', (name, style, cards) => {
    const archetype = classify([...cards]);
    expect(archetype.name).toBe(name);
    expect(archetype.style).toBe(style);
  });

  test('names the win condition the deck is built around', () => {
    expect(classify(['Lava Hound', 'Balloon', 'Mega Minion', 'Barbarians', 'Skeleton Dragons', 'Tombstone', 'Fireball', 'Zap']).winCondition).toBe('Lava Hound');
    expect(classify(['Mega Knight', 'Miner', 'Bats', 'Goblin Gang', 'Inferno Dragon', 'Skeleton Barrel', 'Spear Goblins', 'Zap']).winCondition).toBe('Miner');
  });

  test('names other decks after their win condition and play style', () => {
    expect(classify(['Graveyard', 'Knight', 'Skeletons', 'Ice Spirit', 'Tesla', 'Barbarian Barrel', 'Poison', 'Furnace']).name).toBe('Graveyard Cycle');
    expect(classify(['Lava Hound', 'Valkyrie', 'Mega Minion', 'Goblin Cage', 'Guards', 'Skeleton Dragons', 'Arrows', 'Lightning']).name).toBe('Lava Hound Beatdown');
    expect(classify(['Royal Giant', 'Berserker', 'Hunter', 'Royal Ghost', 'Electro Spirit', 'Skeletons', 'Fireball', 'The Log']).name).toBe('Royal Giant Cycle');
  });

  test('falls back to the play style when no win condition is recognised', () => {
    const archetype = classify(['Knight', 'Archers', 'Skeletons', 'Ice Spirit', 'Cannon', 'Musketeer', 'Fireball', 'The Log']);
    expect(archetype).toEqual({ name: 'Cycle deck', style: 'Cycle' });
  });
});
