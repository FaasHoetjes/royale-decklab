import { distinctDeckNames } from './archetypes';
import { percent } from './cardStats';

type DeckCard = { name: string; elixirCost?: number };
type RankedDeck = { winRate: number; cards: DeckCard[] };
type CardNumbers = { winRate: number; playRate: number };

const MAX_DESCRIPTION_LENGTH = 160;

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Mirrors SpaPages.TopDeckSentence. */
export function topDeckSentence(cardName: string, decks: RankedDeck[], keyCards = 3): string | null {
  const deck = decks[0];
  const name = distinctDeckNames(decks.map((d) => d.cards))[0];
  if (!deck || !name) return null;
  const [archetype = name, ...tells] = name.split(' · ');
  const archetypeWords = new Set(archetype.split(' '));
  const others = deck.cards
    .filter((c) => c.name !== cardName && !c.name.split(' ').every((word) => archetypeWords.has(word)))
    .sort((a, b) => (b.elixirCost ?? 0) - (a.elixirCost ?? 0))
    .map((c) => c.name);
  const key = [...new Set([...tells, ...others])].slice(0, keyCards);
  const withCards = key.length > 0 ? ` with ${list(key)}` : '';
  return `Best ${cardName} war deck right now: ${archetype}${withCards}, ${percent(deck.winRate)} win rate in the top war clans.`;
}

/** Mirrors SpaPages.CardDescription. */
export function cardDescription(cardName: string, stat: CardNumbers | undefined, decks: RankedDeck[]): string {
  const others = decks.length - 1;
  const more = others <= 0 ? '' : others === 1 ? ' Plus 1 more ranked war deck.' : ` Plus ${others} more ranked war decks.`;
  for (const keyCards of [3, 2]) {
    const sentence = topDeckSentence(cardName, decks, keyCards);
    if (!sentence) break;
    if ((sentence + more).length <= MAX_DESCRIPTION_LENGTH) return sentence + more;
    if (sentence.length <= MAX_DESCRIPTION_LENGTH) return sentence;
  }
  const numbers = stat
    ? `${percent(stat.winRate)} win rate, ${percent(stat.playRate)} use rate and its change`
    : 'its win rate, use rate and change';
  return `The best ${cardName} decks for Clash Royale Clan War, ranked on real war battles: ${numbers} since the last balance update.`;
}
