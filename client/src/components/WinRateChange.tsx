import type { CardStat } from '../api';

const NOISE_NOTE = 'Win rate change since the last patch. Grey means it is too small to tell apart from chance.';

/** The win rate change since the last patch: green up, red down, grey when it is within the noise. */
export default function WinRateChange({ stat, long = false, size = 12 }: { stat: CardStat; long?: boolean; size?: number }) {
  if (stat.winRateChange == null) return null;
  const points = stat.winRateChange * 100;
  const up = points >= 0;
  const color = !stat.changeIsClear ? 'var(--text-tertiary)' : up ? 'var(--up)' : 'var(--down)';
  return (
    <span title={NOISE_NOTE} style={{ ...styles.change, color, fontSize: `${size}px` }}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span>
        <span style={styles.srOnly}>{up ? 'up' : 'down'} </span>
        {Math.abs(points).toFixed(1)}
        {long && ' since last patch'}
      </span>
    </span>
  );
}

const styles = {
  change: {
    display: 'inline-flex' as const,
    alignItems: 'baseline' as const,
    gap: '3px',
    fontWeight: 600 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
  srOnly: {
    position: 'absolute' as const,
    width: '1px',
    height: '1px',
    overflow: 'hidden' as const,
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap' as const,
  },
};
