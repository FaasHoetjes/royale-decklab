// The elixir-cost drop shown in a card's top-left corner, modelled on the
// in-game icon: lit from the upper right, plum outline, hot magenta body. The
// gradients are defined once by <ElixirGradientDefs /> (rendered in Layout) so
// a page full of cards doesn't repeat the <defs> per badge.

const BODY_GRADIENT_ID = 'elixirBody';
const GLOW_GRADIENT_ID = 'elixirGlow';
const DIGIT_GRADIENT_ID = 'elixirDigit';
const DROP_PATH =
  'M19.6 1.7 C22.9 4.9 26.7 10.6 26.7 17.3 C26.7 24.2 21.1 29 14 29 C6.9 29 1.3 24.4 1.3 17.7 C1.3 10.4 8.6 4.4 18 1.5 C18.7 1.3 19.2 1.4 19.6 1.7 Z';
const OUTLINE = '#500054';
const DIGIT_SHADOW = '#2e0033';

export function ElixirGradientDefs() {
  return (
    <svg width="0" height="0" style={styles.defs} aria-hidden="true">
      <defs>
        <radialGradient id={BODY_GRADIENT_ID} cx="64%" cy="36%" fx="68%" fy="32%" r="74%">
          <stop offset="0%" stopColor="#ffa4ff" />
          <stop offset="26%" stopColor="#ff40f2" />
          <stop offset="55%" stopColor="#f41ce2" />
          <stop offset="80%" stopColor="#c41cbe" />
          <stop offset="100%" stopColor="#861c96" />
        </radialGradient>
        <radialGradient id={GLOW_GRADIENT_ID} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#ffd0ff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ff80ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={DIGIT_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#fdf3ff" />
          <stop offset="100%" stopColor="#f2c4f6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Drop() {
  return (
    <>
      <path d={DROP_PATH} fill={`url(#${BODY_GRADIENT_ID})`} stroke={OUTLINE} strokeWidth="1.8" strokeLinejoin="round" />
      <ellipse cx="18.4" cy="11.6" rx="3.6" ry="5.2" transform="rotate(28 18.4 11.6)" fill={`url(#${GLOW_GRADIENT_ID})`} />
      <ellipse cx="19.2" cy="10.2" rx="1.05" ry="1.7" transform="rotate(28 19.2 10.2)" fill="#ffffff" />
    </>
  );
}

export default function ElixirBadge({ cost }: { cost: number }) {
  return (
    <svg viewBox="0 0 28 30" style={styles.badge} aria-label={`${cost} elixir`} role="img">
      <Drop />
      <g transform="translate(14 0) scale(1.12 1) translate(-14 0)">
        <text
          x="14"
          y="17.2"
          textAnchor="middle"
          dominantBaseline="central"
          style={styles.number}
          fill={DIGIT_SHADOW}
          stroke={DIGIT_SHADOW}
          strokeWidth="3.8"
          strokeLinejoin="round"
        >
          {cost}
        </text>
        <text
          x="14"
          y="16"
          textAnchor="middle"
          dominantBaseline="central"
          style={styles.number}
          fill={`url(#${DIGIT_GRADIENT_ID})`}
          stroke="#4a0450"
          strokeWidth="3.4"
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {cost}
        </text>
      </g>
    </svg>
  );
}

const styles = {
  defs: {
    position: 'absolute' as const,
    width: 0,
    height: 0,
    pointerEvents: 'none' as const,
  },
  badge: {
    position: 'absolute' as const,
    top: '3px',
    left: '3px',
    width: '23px',
    height: '25px',
    overflow: 'visible' as const,
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45))',
  },
  number: {
    fontFamily: "'Lilita One', system-ui, -apple-system, sans-serif",
    fontSize: '18px',
  },
};
