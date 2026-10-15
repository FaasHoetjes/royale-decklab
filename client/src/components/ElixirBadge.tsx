// The elixir-cost drop shown in a card's top-left corner, modelled on the
// in-game icon: lit from the upper right, plum outline, hot magenta body. The
// gradients are defined once by <ElixirGradientDefs /> (rendered in Layout) so
// a page full of cards doesn't repeat the <defs> per badge.

const BODY_GRADIENT_ID = 'elixirBody';
const GLOW_GRADIENT_ID = 'elixirGlow';
const DROP_PATH =
  'M19.6 1.7 C22.9 4.9 26.7 10.6 26.7 17.3 C26.7 24.2 21.1 29 14 29 C6.9 29 1.3 24.4 1.3 17.7 C1.3 10.4 8.6 4.4 18 1.5 C18.7 1.3 19.2 1.4 19.6 1.7 Z';
const OUTLINE = '#500054';

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

export function ElixirDropIcon({ width = 15, height = 16 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 28 30" style={{ width, height, overflow: 'visible', filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35))' }} aria-hidden="true">
      <Drop />
    </svg>
  );
}

export default function ElixirBadge({ cost }: { cost: number }) {
  return (
    <svg viewBox="0 0 28 30" style={styles.badge} aria-label={`${cost} elixir`} role="img">
      <Drop />
      <text
        x="13.6"
        y="18.6"
        textAnchor="middle"
        dominantBaseline="central"
        style={styles.number}
        fill="#ffffff"
        stroke="#3a003e"
        strokeWidth="2.8"
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {cost}
      </text>
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
    fontSize: '14px',
  },
};
