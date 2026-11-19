import { Fragment, type ReactNode } from 'react';
import type { CardStat } from '../api';
import { percent, wholePercents } from '../lib/cardStats';
import { SPECIAL_COLOR } from '../lib/slotStyles';
import type { Theme } from '../theme';

export function StatTile({ theme, value, label, children }: { theme: Theme; value: string; label: string; children?: ReactNode }) {
  return (
    <div style={{ ...styles.tile, backgroundColor: theme.bg.tertiary }}>
      <div style={{ ...styles.tileValue, color: theme.text.primary }}>{value}</div>
      <div style={{ ...styles.tileLabel, color: theme.text.secondary }}>{label}</div>
      {children && <div style={styles.tileExtra}>{children}</div>}
    </div>
  );
}

const shareLabel = (whole: number | undefined) => (whole === 0 ? '<1%' : `${whole}%`);

export function PlaySplit({ theme, stat }: { theme: Theme; stat: CardStat }) {
  const parts = [
    { label: 'Evo', share: stat.evoShare, winRate: stat.evoWinRate, color: SPECIAL_COLOR.evo },
    { label: 'Hero', share: stat.heroShare, winRate: stat.heroWinRate, color: SPECIAL_COLOR.hero },
    { label: 'Normal', share: Math.max(0, 1 - stat.evoShare - stat.heroShare), winRate: stat.normalWinRate, color: 'var(--text-tertiary)' },
  ].filter((p) => p.share > 0);
  const shown = wholePercents(parts.map((p) => p.share));
  const header = { ...styles.rowHeader, color: theme.text.tertiary };
  return (
    <div style={styles.split}>
      <div style={{ ...styles.splitTitle, color: theme.text.primary }}>How it's played</div>
      <div style={styles.splitBar} role="img" aria-label={parts.map((p, i) => `${p.label} ${shareLabel(shown[i])}`).join(', ')}>
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${p.share * 100}%`, backgroundColor: p.color }} />
        ))}
      </div>
      <div style={styles.rows}>
        <span />
        <span style={header}>Version</span>
        <span style={{ ...header, textAlign: 'right' }}>Played</span>
        <span style={{ ...header, textAlign: 'right' }}>Win rate</span>
        {parts.map((p, i) => (
          <Fragment key={p.label}>
            <i style={{ ...styles.legendDot, backgroundColor: p.color }} />
            <span style={{ color: theme.text.secondary }}>{p.label}</span>
            <span style={{ ...styles.rowShare, color: theme.text.primary }}>{shareLabel(shown[i])}</span>
            <span style={{ ...styles.rowWinRate, color: p.winRate != null ? theme.text.primary : theme.text.tertiary }}>
              {p.winRate != null ? percent(p.winRate) : '–'}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const styles = {
  tile: {
    padding: '10px 14px',
    borderRadius: '12px',
    minWidth: 0,
  },
  tileValue: {
    fontSize: '22px',
    fontWeight: 800 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    lineHeight: 1.15,
  },
  tileLabel: {
    fontSize: '12px',
    marginTop: '2px',
  },
  tileExtra: {
    marginTop: '4px',
    fontSize: '12px',
    fontWeight: 600 as const,
  },
  split: {
    maxWidth: '520px',
  },
  splitTitle: {
    fontSize: '13px',
    fontWeight: 700 as const,
    marginBottom: '8px',
  },
  splitBar: {
    display: 'flex' as const,
    gap: '2px',
    height: '12px',
    borderRadius: '999px',
    overflow: 'hidden' as const,
  },
  rows: {
    display: 'grid' as const,
    gridTemplateColumns: 'auto 1fr auto auto',
    alignItems: 'center' as const,
    gap: '6px 14px',
    marginTop: '10px',
    fontSize: '13px',
  },
  rowHeader: {
    fontSize: '11px',
    fontWeight: 600 as const,
  },
  rowShare: {
    fontSize: '15px',
    fontWeight: 800 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
  },
  rowWinRate: {
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
    minWidth: '72px',
  },
  legendDot: {
    width: '9px',
    height: '9px',
    borderRadius: '3px',
  },
};
