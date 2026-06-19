// Computer drafting logic and the player's timeout auto-pick (§5).
//
// All three difficulties score candidates with pickValue (counter the opponent's
// board + improve own deck); they differ in how greedily they pick and whether
// they actively deny the player's best cards.

import type { CardTag, Difficulty } from './types';
import { pickValue, counterScore, completenessDelta } from './scoring';
import type { Rng } from './rng';

/**
 * The computer's pick from `available`, given both decks so far.
 *  - easy:   pick randomly from the better half by raw value (leaves good
 *            counters on the board for the player).
 *  - medium: take the best by value, with light noise.
 *  - hard:   maximize value + denial, where denial = how good the card would
 *            have been for the player — so Hard actively drafts away the player's
 *            best answers and lowers their achievable score.
 */
export function computerPick(
  available: CardTag[],
  computerDeck: CardTag[],
  playerDeck: CardTag[],
  difficulty: Difficulty,
  rng: Rng = Math.random,
): CardTag {
  if (available.length === 1) return available[0]!;

  const scored = available.map(card => {
    const value = pickValue(card, playerDeck, computerDeck);
    const denial = counterScore(card, computerDeck) + completenessDelta(playerDeck, card);
    return { card, value, denial };
  });

  if (difficulty === 'easy') {
    const ranked = [...scored].sort((a, b) => b.value - a.value);
    const topHalf = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
    return topHalf[Math.floor(rng() * topHalf.length)]!.card;
  }

  if (difficulty === 'medium') {
    let best = scored[0]!;
    let bestScore = -Infinity;
    for (const s of scored) {
      const noise = rng() * 2;                 // small jitter so it isn't perfectly robotic
      const total = s.value + noise;
      if (total > bestScore) { bestScore = total; best = s; }
    }
    return best.card;
  }

  // hard
  let best = scored[0]!;
  let bestScore = -Infinity;
  for (const s of scored) {
    const total = s.value + 0.6 * s.denial;
    if (total > bestScore) { bestScore = total; best = s; }
  }
  return best.card;
}

/**
 * The player's auto-pick when their timer runs out: the highest-value available
 * card for the player (a sensible default, never random) so running out of time
 * is forgiving.
 */
export function autoPickForPlayer(
  available: CardTag[],
  playerDeck: CardTag[],
  computerDeck: CardTag[],
): CardTag {
  let best = available[0]!;
  let bestScore = -Infinity;
  for (const card of available) {
    const v = pickValue(card, computerDeck, playerDeck);
    if (v > bestScore) { bestScore = v; best = card; }
  }
  return best;
}
