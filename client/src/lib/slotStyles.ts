import type { CSSProperties } from 'react';

export type SlotKind = 'evo' | 'hero' | 'both';

const SLOT_ORDER: SlotKind[] = ['evo', 'hero', 'both'];

export function slotKind(index: number): SlotKind | null {
  return SLOT_ORDER[index] ?? null;
}

// Theme-dependent values live as CSS variables (index.css) so a light/dark
// toggle never re-renders the (many) card tiles built from these.
export const CARD_BACKDROP = 'var(--card-backdrop)';

export const CARD_FRAME: CSSProperties = {
  background: CARD_BACKDROP,
  border: 'var(--card-frame-border)',
  boxShadow: 'var(--card-drop)',
};

// `shadow` is the glow layer(s) of the box-shadow; the 'both' slot splits its
// glow and border (purple off the left, gold off the right) for a clean two-tone edge.
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

// Uses the padding-box/border-box background trick so the gradient border
// respects the card's rounded corners (a plain border-color can't be a gradient).
export function slotBorderStyle(
  kind: SlotKind,
  innerBg?: string,
  glow: boolean = true,
): CSSProperties {
  const { grad, shadow } = BORDER[kind];
  const fill = innerBg ?? CARD_BACKDROP;
  return {
    border: '3px solid transparent',
    backgroundColor: 'transparent',
    background: `${fill} padding-box, ${grad} border-box`,
    boxShadow: glow ? `${shadow}, var(--card-drop)` : 'var(--card-drop)',
  };
}
