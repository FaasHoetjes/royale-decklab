import type { BuilderCard } from './builderCards';
import { CHAMPION_SLOTS, SLOTS_PER_DECK, type DeckState } from './deckBoard';
import { distinctDeckNames } from './archetypes';

export type Deck = (number | null)[];

/** Where a picked card lands, and the card that has to step aside to make room for a champion. */
export interface Placement {
  slot: number;
  bump?: { from: number; to: number };
}

function hasChampionAt(deck: Deck, slot: number, cardById: Map<number, BuilderCard>): boolean {
  const id = deck[slot];
  return id != null && cardById.get(id)?.rarity === 'champion';
}

export function deckCards(deck: Deck, cardById: Map<number, BuilderCard>): BuilderCard[] {
  return deck.flatMap((id) => {
    const card = id != null ? cardById.get(id) : undefined;
    return card ? [card] : [];
  });
}

/** The chosen slot if it's open, otherwise the first open one from the left (-1 if the deck is full). */
export function nextSlot(deck: Deck, chosen: number | null): number {
  if (chosen != null && deck[chosen] == null) return chosen;
  return deck.findIndex((id) => id == null);
}

/**
 * Where a picked card goes, or null if it doesn't fit. Champions only go in the hero slots, so when
 * those hold other cards, one of them moves to the open slot to make room.
 */
export function placeInDeck(
  deck: Deck,
  card: BuilderCard | undefined,
  chosen: number | null,
  cardById: Map<number, BuilderCard>
): Placement | null {
  const open = nextSlot(deck, chosen);
  if (open < 0) return null;
  if (card?.rarity !== 'champion' || CHAMPION_SLOTS.includes(open)) return { slot: open };
  const freeHero = CHAMPION_SLOTS.find((i) => deck[i] == null);
  if (freeHero != null) return { slot: freeHero };
  const taken = CHAMPION_SLOTS.find((i) => !hasChampionAt(deck, i, cardById));
  return taken == null ? null : { slot: taken, bump: { from: taken, to: open } };
}

/** Whether a champion can still be added: the deck has room and a hero slot without a champion. */
export function championFits(deck: Deck, cardById: Map<number, BuilderCard>): boolean {
  return deck.includes(null) && CHAMPION_SLOTS.some((i) => !hasChampionAt(deck, i, cardById));
}

/** Complete decks get their archetype name; the rest are numbered. */
export function builderDeckNames(decks: DeckState, cardById: Map<number, BuilderCard>): string[] {
  const complete = decks
    .map((deck, i) => ({ i, cards: deckCards(deck, cardById) }))
    .filter((d) => d.cards.length === SLOTS_PER_DECK);
  const names = distinctDeckNames(complete.map((d) => d.cards));
  const out = decks.map((_, i) => `Deck ${i + 1}`);
  complete.forEach((d, k) => {
    if (names[k]) out[d.i] = names[k];
  });
  return out;
}

/** Elixir of the four cheapest cards: how much it costs to cycle back to the first one. */
export function cycleCost(cards: BuilderCard[]): number | null {
  if (cards.length < 4) return null;
  return [...cards]
    .map((c) => c.elixirCost ?? 0)
    .sort((a, b) => a - b)
    .slice(0, 4)
    .reduce((sum, e) => sum + e, 0);
}

/** Card counts per elixir cost, 1 to 6+. */
export function elixirCurve(cards: BuilderCard[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0];
  cards.forEach((c) => {
    if (c.elixirCost == null) return;
    buckets[Math.min(6, Math.max(1, c.elixirCost)) - 1]!++;
  });
  return buckets;
}
