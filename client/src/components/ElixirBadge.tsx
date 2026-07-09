// The elixir-cost drop shown in a card's top-left corner. The purple gradient
// is defined once by <ElixirGradientDefs /> (rendered in Layout) so a page full
// of cards doesn't repeat the <defs> per badge.

const GRADIENT_ID = 'elixirGrad';
const DROP_PATH = 'M24 5 Q24 18 22.8 24.9 A12 12 0 0 1 1.7 13.9 Q6 6 24 5 Z';

export function ElixirGradientDefs() {
  return (
    <svg width="0" height="0" style={styles.defs} aria-hidden="true">
      <defs>
        <radialGradient id={GRADIENT_ID} cx="36%" cy="62%" r="70%">
          <stop offset="0%" stopColor="#f6a8ff" />
          <stop offset="45%" stopColor="#d63bd6" />
          <stop offset="100%" stopColor="#a0149e" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function ElixirDropIcon({ width = 15, height = 16 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 28 30" style={{ width, height, filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4))' }} aria-hidden="true">
      <path d={DROP_PATH} fill="#d63bd6" stroke="#000000" strokeWidth="1.6" />
    </svg>
  );
}

export default function ElixirBadge({ cost }: { cost: number }) {
  return (
    <div style={styles.wrap}>
      <svg viewBox="0 0 28 30" style={styles.drop} aria-hidden="true">
        <path d={DROP_PATH} fill={`url(#${GRADIENT_ID})`} stroke="#000000" strokeWidth="1.6" />
        <ellipse cx="9" cy="14" rx="2.4" ry="3.4" fill="rgba(255,255,255,0.55)" transform="rotate(-20 9 14)" />
      </svg>
      <span style={styles.text}>{cost}</span>
    </div>
  );
}

const styles = {
  defs: {
    position: 'absolute' as const,
    width: 0,
    height: 0,
    pointerEvents: 'none' as const,
  },
  wrap: {
    position: 'absolute' as const,
    top: '3px',
    left: '3px',
    width: '23px',
    height: '25px',
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
  },
  drop: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
  },
  text: {
    position: 'absolute' as const,
    left: 0,
    right: '8%',
    top: '60%',
    transform: 'translateY(-50%)',
    textAlign: 'center' as const,
    color: 'white',
    fontWeight: 'bold' as const,
    fontSize: '11px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
  },
};
