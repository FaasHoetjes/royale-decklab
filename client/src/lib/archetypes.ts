// Names a deck the way players do ("Hog 2.6", "Log Bait", "Lava Loon") from its win condition and key
// support cards. The rules are checked in order and the first match wins, so specific variants come
// before their general form. Win conditions follow common community lists (Hog Rider, Royal Giant,
// Giant, Golem, Lava Hound, X-Bow, Mortar, Graveyard, Miner, Goblin Drill, Goblin Barrel, Balloon,
// Royal Hogs, ...); Mega Knight and P.E.K.K.A aren't win conditions on their own, so their decks are
// named after the card that pairs with them. Decks without a well-known name are called after their
// win condition and play style, e.g. "Graveyard Cycle". Card names match the API's.

export type PlayStyle = 'Beatdown' | 'Cycle' | 'Control' | 'Siege' | 'Bait' | 'Bridge Spam';

export interface Archetype {
  /** e.g. "Hog 2.6" or "Graveyard Cycle"; the play style plus "deck" when no rule matches. */
  name: string;
  style: PlayStyle;
  /** The card the deck is built around, if a rule matched. */
  winCondition?: string;
}

interface DeckInfo {
  has: (...names: string[]) => boolean;
  hasAny: (...names: string[]) => boolean;
  avg: number;
}

interface Rule {
  /** The deck's well-known name; without one it's the win condition plus the play style. */
  name?: string | ((deck: DeckInfo) => string);
  winCondition: string;
  /** All of these must be in the deck. */
  needs: string[];
  /** Extra condition, e.g. one of several support cards. */
  when?: (deck: DeckInfo) => boolean;
  /** Fixed play style; otherwise it follows from the deck's average elixir. */
  style?: PlayStyle | ((deck: DeckInfo) => PlayStyle);
}

const BAIT_SUPPORT = ['Princess', 'Goblin Gang', 'Dart Goblin', 'Rascals', 'Skeleton Barrel', 'Spear Goblins', 'Bats'];
const BRIDGE_SUPPORT = ['Battle Ram', 'Bandit', 'Royal Ghost', 'Dark Prince', 'Prince', 'Elite Barbarians', 'Ram Rider'];

const RULES: Rule[] = [
  { name: 'Lava Loon', winCondition: 'Lava Hound', needs: ['Lava Hound', 'Balloon'], style: 'Beatdown' },
  { winCondition: 'Lava Hound', needs: ['Lava Hound'], style: 'Beatdown' },
  { name: 'Golem Beatdown', winCondition: 'Golem', needs: ['Golem'], style: 'Beatdown' },
  { winCondition: 'Electro Giant', needs: ['Electro Giant'], style: 'Beatdown' },
  { name: 'Goblin Giant Sparky', winCondition: 'Goblin Giant', needs: ['Goblin Giant', 'Sparky'], style: 'Beatdown' },
  { winCondition: 'Goblin Giant', needs: ['Goblin Giant'], style: 'Beatdown' },
  { name: 'Giant Graveyard', winCondition: 'Giant', needs: ['Giant', 'Graveyard'], style: 'Beatdown' },
  { name: 'Giant Beatdown', winCondition: 'Giant', needs: ['Giant'], style: 'Beatdown' },
  { name: 'Royal Giant Fisherman', winCondition: 'Royal Giant', needs: ['Royal Giant', 'Fisherman'] },
  { winCondition: 'Royal Giant', needs: ['Royal Giant'] },
  { winCondition: 'Elixir Golem', needs: ['Elixir Golem'] },
  { winCondition: 'Rune Giant', needs: ['Rune Giant'] },
  { name: (d) => (d.avg <= 3.2 ? 'X-Bow Cycle' : 'X-Bow Siege'), winCondition: 'X-Bow', needs: ['X-Bow'], style: 'Siege' },
  { name: 'Mortar Bait', winCondition: 'Mortar', needs: ['Mortar'], when: (d) => d.hasAny(...BAIT_SUPPORT), style: 'Siege' },
  { winCondition: 'Mortar', needs: ['Mortar'], style: 'Siege' },
  {
    name: 'Splashyard',
    winCondition: 'Graveyard',
    needs: ['Graveyard'],
    when: (d) => d.hasAny('Baby Dragon', 'Ice Wizard') && d.hasAny('Tornado', 'Poison'),
    style: 'Control',
  },
  { name: 'Graveyard Freeze', winCondition: 'Graveyard', needs: ['Graveyard', 'Freeze'] },
  { winCondition: 'Graveyard', needs: ['Graveyard'] },
  { name: 'Hog 2.6', winCondition: 'Hog Rider', needs: ['Hog Rider', 'Musketeer', 'Cannon', 'Ice Golem'], style: 'Cycle' },
  { name: 'Hog EQ', winCondition: 'Hog Rider', needs: ['Hog Rider', 'Earthquake'] },
  { winCondition: 'Hog Rider', needs: ['Hog Rider'] },
  { name: 'Royal Hogs Recruits', winCondition: 'Royal Hogs', needs: ['Royal Hogs', 'Royal Recruits'], style: 'Bridge Spam' },
  { name: 'Royal Hogs EQ', winCondition: 'Royal Hogs', needs: ['Royal Hogs', 'Earthquake'] },
  { winCondition: 'Royal Hogs', needs: ['Royal Hogs'] },
  { name: 'Lumberloon', winCondition: 'Balloon', needs: ['Balloon', 'Lumberjack'] },
  { name: 'Balloon Freeze', winCondition: 'Balloon', needs: ['Balloon', 'Freeze'] },
  { winCondition: 'Balloon', needs: ['Balloon'] },
  {
    name: 'Log Bait',
    winCondition: 'Goblin Barrel',
    needs: ['Goblin Barrel'],
    when: (d) => d.has('Princess') || d.hasAny('Goblin Gang', 'Dart Goblin', 'Rascals'),
    style: 'Bait',
  },
  { winCondition: 'Goblin Barrel', needs: ['Goblin Barrel'], style: 'Bait' },
  { winCondition: 'Goblin Drill', needs: ['Goblin Drill'] },
  {
    name: 'PEKKA Bridge Spam',
    winCondition: 'P.E.K.K.A',
    needs: ['P.E.K.K.A'],
    when: (d) => d.hasAny(...BRIDGE_SUPPORT),
    style: 'Bridge Spam',
  },
  { name: 'Mega Knight Miner', winCondition: 'Miner', needs: ['Mega Knight', 'Miner'] },
  { name: 'Mega Knight Wall Breakers', winCondition: 'Wall Breakers', needs: ['Mega Knight', 'Wall Breakers'] },
  { name: 'Miner Wall Breakers', winCondition: 'Miner', needs: ['Miner', 'Wall Breakers'] },
  { name: 'Miner Poison', winCondition: 'Miner', needs: ['Miner', 'Poison'], style: 'Control' },
  { winCondition: 'Miner', needs: ['Miner'] },
  { winCondition: 'Ram Rider', needs: ['Ram Rider'], style: 'Bridge Spam' },
  {
    name: 'Bridge Spam',
    winCondition: 'Battle Ram',
    needs: ['Battle Ram'],
    when: (d) => d.hasAny(...BRIDGE_SUPPORT.filter((c) => c !== 'Battle Ram'), 'Giant Skeleton'),
    style: 'Bridge Spam',
  },
  { winCondition: 'Battle Ram', needs: ['Battle Ram'] },
  { winCondition: 'Wall Breakers', needs: ['Wall Breakers'] },
  {
    name: 'Skeleton Barrel Bait',
    winCondition: 'Skeleton Barrel',
    needs: ['Skeleton Barrel'],
    when: (d) => d.hasAny(...BAIT_SUPPORT.filter((c) => c !== 'Skeleton Barrel'), 'Skeleton Army'),
    style: 'Bait',
  },
  { winCondition: 'Skeleton Barrel', needs: ['Skeleton Barrel'] },
  { winCondition: 'Three Musketeers', needs: ['Three Musketeers'] },
  { winCondition: 'Sparky', needs: ['Sparky'] },
  { winCondition: 'P.E.K.K.A', needs: ['P.E.K.K.A'] },
  { winCondition: 'Mega Knight', needs: ['Mega Knight'] },
];

const BEATDOWN_TANKS = ['Golem', 'Lava Hound', 'Electro Giant', 'Giant', 'Goblin Giant'];

/** Beatdown, Cycle or Control from the elixir cost alone; rules can name a more specific style. */
function styleByElixir(deck: DeckInfo): PlayStyle {
  return deck.hasAny(...BEATDOWN_TANKS) && deck.avg >= 3.8 ? 'Beatdown' : deck.avg <= 3.2 ? 'Cycle' : 'Control';
}

export function classifyDeck(cards: Array<{ name: string; elixirCost?: number }>): Archetype {
  const names = new Set(cards.map((c) => c.name));
  const deck: DeckInfo = {
    has: (...n) => n.every((x) => names.has(x)),
    hasAny: (...n) => n.some((x) => names.has(x)),
    avg: cards.length ? cards.reduce((s, c) => s + (c.elixirCost ?? 0), 0) / cards.length : 0,
  };
  const rule = RULES.find((r) => deck.has(...r.needs) && (r.when?.(deck) ?? true));
  if (!rule) {
    const style = styleByElixir(deck);
    return { name: `${style} deck`, style };
  }
  const style = typeof rule.style === 'function' ? rule.style(deck) : rule.style ?? styleByElixir(deck);
  return {
    name: typeof rule.name === 'function' ? rule.name(deck) : rule.name ?? `${rule.winCondition} ${style}`,
    style,
    winCondition: rule.winCondition,
  };
}

/** The card to show for a deck: its win condition, or its most expensive card when it has none. */
export function featuredCard<T extends { name: string; elixirCost?: number }>(cards: T[]): T | undefined {
  const { winCondition } = classifyDeck(cards);
  return cards.find((c) => c.name === winCondition) ?? [...cards].sort((a, b) => (b.elixirCost ?? 0) - (a.elixirCost ?? 0))[0];
}
