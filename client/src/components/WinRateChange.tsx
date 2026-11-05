import type { CardStat } from '../api';
import { percent } from '../lib/cardStats';
import InfoTip from './InfoTip';

function explain(stat: CardStat): string {
  const chance = stat.changeMargin != null ? ` With this many games, chance alone can move a win rate by up to ${percent(stat.changeMargin)}.` : '';
  return stat.changeIsClear
    ? `Win rate change since the last patch.${chance}`
    : `Win rate change since the last patch, but too few games played to call it a trend.${chance}`;
}

function withinChance(stat: CardStat, change: number): string {
  const margin = stat.changeMargin != null ? `by up to ${percent(stat.changeMargin)}` : 'this much';
  return `${change >= 0 ? 'Up' : 'Down'} ${percent(Math.abs(change))} since last patch, but at this many games chance alone can move a win rate ${margin}, so treat it as unchanged.`;
}

function changeColor(isClear: boolean, up: boolean): string {
  if (!isClear) return 'var(--text-tertiary)';
  return up ? 'var(--up)' : 'var(--down)';
}

/**
 * The win rate change since the last patch as a pill: green up, red down, grey when chance alone could explain it.
 * `detailed` adds an info tip to a grey pill saying so.
 */
export default function WinRateChange({ stat, large = false, detailed = false }: { stat: CardStat; large?: boolean; detailed?: boolean }) {
  if (stat.winRateChange == null) return null;
  const up = stat.winRateChange >= 0;
  const color = changeColor(stat.changeIsClear, up);
  return (
    <span title={detailed ? undefined : explain(stat)} style={styles.wrap}>
      <span
        style={{
          ...styles.pill,
          ...(large ? styles.pillLarge : {}),
          color,
          backgroundColor: `color-mix(in srgb, ${color} ${stat.changeIsClear ? 16 : 14}%, transparent)`,
        }}
      >
        <svg width={large ? 11 : 10} height={large ? 11 : 10} viewBox="0 0 12 12" aria-hidden="true" style={styles.arrow}>
          <path
            d={up ? 'M6 10V2M2.5 5.5L6 2l3.5 3.5' : 'M6 2v8M2.5 6.5L6 10l3.5-3.5'}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={styles.srOnly}>{up ? 'up' : 'down'} </span>
        {percent(Math.abs(stat.winRateChange))}
      </span>
      {detailed && !stat.changeIsClear && (
        <InfoTip ariaLabel="What the grey change means" color="var(--text-secondary)" width={250} placement="bottom">
          {withinChance(stat, stat.winRateChange)}
        </InfoTip>
      )}
    </span>
  );
}

const styles = {
  wrap: {
    display: 'inline-flex' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: '4px 6px',
  },
  pill: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '3px',
    height: '17px',
    padding: '0 6px 0 4px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
  pillLarge: {
    height: '20px',
    padding: '0 8px 0 6px',
    fontSize: '12px',
  },
  arrow: {
    flexShrink: 0,
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
