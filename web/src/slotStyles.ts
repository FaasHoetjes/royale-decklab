import type { CSSProperties } from 'react';

// The in-game evolution slots are positional and colour-coded: slot 1 takes an
// evolution (purple), slot 2 the hero (gold), slot 3 either one (purple→gold).
// We mirror that framing in both the War Deck Generator and the War Deck Builder
// so the slot a card sits in reads at a glance, matching the live game.
export type SlotKind = 'evo' | 'hero' | 'both';

const SLOT_ORDER: SlotKind[] = ['evo', 'hero', 'both'];

/** The slot kind for a positional index, or null for the normal (4th+) slots. */
export function slotKind(index: number): SlotKind | null {
  return SLOT_ORDER[index] ?? null;
}

const CARD_BG = 'linear-gradient(160deg, #2a3a6a 0%, #16213f 100%)';

// `shadow` is the glow layer(s) of the box-shadow (the dark drop shadow is added
// in slotBorderStyle). The 'both' slot splits its glow as well as its border —
// purple bleeding off the left edge, gold off the right — so the two-tone split
// reads clearly instead of blending into one muddy colour.
const BORDER: Record<SlotKind, { grad: string; shadow: string }> = {
  evo: {
    grad: 'linear-gradient(135deg, #d486ff, #8a2be2)',
    shadow: '0 0 10px rgba(160, 60, 240, 0.75)',
  },
  hero: {
    grad: 'linear-gradient(135deg, #ffe27a, #f5a623)',
    shadow: '0 0 10px rgba(245, 170, 40, 0.75)',
  },
  both: {
    grad: 'linear-gradient(90deg, #b14bff 0%, #b14bff 50%, #f5a623 50%, #f5a623 100%)',
    shadow: '-6px 0 9px rgba(160, 60, 240, 0.8), 6px 0 9px rgba(245, 170, 40, 0.8)',
  },
};

/**
 * Glowing colour-coded border for a special slot, built with the padding-box /
 * border-box background trick so the gradient border respects the card's rounded
 * corners (a plain border-color can't be a gradient). `innerBg` is the fill behind
 * the border: the card gradient for a filled slot, 'transparent' for an empty one.
 */
export function slotBorderStyle(
  kind: SlotKind,
  innerBg: string = CARD_BG,
  glow: boolean = true,
): CSSProperties {
  const { grad, shadow } = BORDER[kind];
  return {
    border: '3px solid transparent',
    backgroundColor: 'transparent',
    background: `${innerBg} padding-box, ${grad} border-box`,
    // The coloured halo belongs to a real, filled card. On an empty slot it
    // reads as neon against the dark interior, so we keep only the soft drop
    // shadow there and let the gradient outline mark the slot quietly.
    boxShadow: glow ? `${shadow}, 0 3px 8px rgba(0, 0, 0, 0.25)` : '0 3px 8px rgba(0, 0, 0, 0.25)',
  };
}
