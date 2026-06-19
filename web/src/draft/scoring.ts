// The counter / scoring engine (§5). All pure functions over CardTag[].
//
// Two ideas drive it:
//  - counterScore: how well a candidate card answers a set of opponent cards,
//    from a small role-attribute rules table plus the hand-curated HARD_COUNTERS.
//  - deckPoints: how strong/complete a deck is on its own (win con, air cover,
//    splash, spell, elixir), independent of the opponent.
// The final performance score blends counter coverage, completeness and elixir.

import type { CardTag, Side } from './types';
import { HARD_COUNTERS } from '../data/cardTags';

/** Role-based counter weight of `card` against a single opponent card `o`. */
export function roleCounterWeight(card: CardTag, o: CardTag): number {
  let w = 0;
  if (card.targetsAir && o.air) w += 3;                              // answers an air threat
  if (card.splash && o.swarm) w += 3;                               // splash clears swarms
  if (card.spellSize === 'small' && o.swarm) w += 2;                // small spell clears swarm
  if (card.building && o.winCondition && !o.air) w += 4;            // building walls ground win cons
  if (card.spellSize === 'big' && (o.swarm || o.building)) w += 3;  // big spell vs clusters/buildings
  if (card.buckets.includes('antiTank') && o.tank) w += 4;          // high DPS melts tanks
  return w;
}

const hardCounterMult = (card: CardTag, o: CardTag): number => {
  const hc = HARD_COUNTERS.find(h => h.counter === card.name && h.targets.includes(o.name));
  return hc ? hc.mult : 1;
};

/**
 * Total counter value of `card` against every card in `opponent`. A hard-counter
 * match guarantees a floor of credit (so famous answers score even when the role
 * table is silent) and multiplies whatever role weight exists.
 */
export function counterScore(card: CardTag, opponent: CardTag[]): number {
  let score = 0;
  for (const o of opponent) {
    const mult = hardCounterMult(card, o);
    const base = roleCounterWeight(card, o);
    score += mult > 1 ? Math.max(base, 2) * mult : base;
  }
  return score;
}

/** Standalone strength of a deck (0..~90). Used for completeness + per-pick deltas. */
export function deckPoints(deck: CardTag[]): number {
  if (deck.length === 0) return 0;
  let p = 0;
  const wins = deck.filter(c => c.winCondition).length;
  p += wins >= 1 ? 25 : 0;
  if (wins >= 2) p += 5;                                   // a backup threat is nice, not required
  const airAnswers = deck.filter(c => c.targetsAir).length;
  p += Math.min(airAnswers, 3) * 7;                        // up to 21 for solid air coverage
  if (deck.some(c => c.splash)) p += 12;                   // a splasher to handle swarms
  if (deck.some(c => c.buckets.includes('smallSpell') || c.buckets.includes('bigSpell'))) p += 12;
  if (deck.some(c => c.building)) p += 8;                  // defensive building
  if (deck.some(c => c.buckets.includes('antiTank'))) p += 10; // a tank-killer
  return p;
}

/** Change in standalone deck strength from adding `card` to `deck`. */
export function completenessDelta(deck: CardTag[], card: CardTag): number {
  return deckPoints([...deck, card]) - deckPoints(deck);
}

/**
 * Points awarded for one pick, shown live as "+N": how well it answers the
 * opponent's current board, plus how much it improves your own deck. Rounded so
 * the UI shows clean integers. Always >= 0 so a pick never reads as a punishment.
 */
export function pickPoints(card: CardTag, opponentBoard: CardTag[], ownDeck: CardTag[]): number {
  const counter = counterScore(card, opponentBoard);
  const completeness = completenessDelta(ownDeck, card);
  return Math.max(0, Math.round(counter + completeness));
}

/**
 * Value of a card to a given side, used by the AI and by the player's timeout
 * auto-pick: counter value vs the opponent's board + own-deck improvement.
 */
export function pickValue(card: CardTag, opponentBoard: CardTag[], ownDeck: CardTag[]): number {
  return counterScore(card, opponentBoard) + completenessDelta(ownDeck, card);
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const avgElixir = (deck: CardTag[]) =>
  deck.length ? deck.reduce((s, c) => s + c.elixir, 0) / deck.length : 0;

export interface ScoreBreakdown {
  total: number;          // 0..100
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  counterCoverage: number; // 0..100
  completeness: number;    // 0..100
  elixirBalance: number;   // 0..100
  avgElixir: number;
}

/**
 * Final performance score for the player's completed deck against the computer's.
 * Pure function of the two decks — there is no "winner", just a grade of how well
 * the player drafted (counter coverage + deck completeness + elixir balance).
 */
export function finalScore(playerDeck: CardTag[], computerDeck: CardTag[]): ScoreBreakdown {
  // Counter coverage: for each opponent card, the player's single best answer,
  // capped so one over-the-top counter can't carry the whole score.
  const CAP = 8;
  let coverageRaw = 0;
  for (const o of computerDeck) {
    let best = 0;
    for (const c of playerDeck) {
      const mult = hardCounterMult(c, o);
      const v = mult > 1 ? Math.max(roleCounterWeight(c, o), 2) * mult : roleCounterWeight(c, o);
      if (v > best) best = v;
    }
    coverageRaw += Math.min(best, CAP);
  }
  const counterCoverage = computerDeck.length
    ? clamp((coverageRaw / (computerDeck.length * CAP)) * 100, 0, 100)
    : 0;

  const completeness = clamp((deckPoints(playerDeck) / 87) * 100, 0, 100);

  const avg = avgElixir(playerDeck);
  const elixirBalance = clamp(100 - Math.abs(avg - 3.4) * 28, 0, 100);

  const total = Math.round(0.5 * counterCoverage + 0.35 * completeness + 0.15 * elixirBalance);
  const grade: ScoreBreakdown['grade'] =
    total >= 90 ? 'S' : total >= 80 ? 'A' : total >= 68 ? 'B' : total >= 55 ? 'C' : 'D';

  return {
    total,
    grade,
    counterCoverage: Math.round(counterCoverage),
    completeness: Math.round(completeness),
    elixirBalance: Math.round(elixirBalance),
    avgElixir: Math.round(avg * 10) / 10,
  };
}

/** Re-export so consumers can use the same Side type without a second import. */
export type { Side };
