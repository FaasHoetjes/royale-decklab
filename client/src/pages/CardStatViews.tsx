import type { ReactNode } from 'react';
import type { CardStat } from '../api';
import { percent } from '../lib/cardStats';
import type { Theme } from '../theme';

const EVO_COLOR = '#b14bff';
const HERO_COLOR = '#f5a623';

export function StatTile({ theme, value, label, children }: { theme: Theme; value: string; label: string; children?: ReactNode }) {
  return (
    <div style={{ ...styles.tile, backgroundColor: theme.bg.tertiary }}>
      <div style={{ ...styles.tileValue, color: theme.text.primary }}>{value}</div>
      <div style={{ ...styles.tileLabel, color: theme.text.secondary }}>{label}</div>
      {children && <div style={styles.tileExtra}>{children}</div>}
    </div>
  );
}

export function PlaySplit({ theme, stat }: { theme: Theme; stat: CardStat }) {
  const parts = [
    { label: 'Evo', share: stat.evoShare, color: EVO_COLOR },
    { label: 'Hero', share: stat.heroShare, color: HERO_COLOR },
    { label: 'Normal', share: Math.max(0, 1 - stat.evoShare - stat.heroShare), color: 'var(--text-tertiary)' },
  ].filter((p) => p.share > 0);
  return (
    <div style={styles.split}>
      <div style={{ ...styles.splitTitle, color: theme.text.primary }}>How it's played</div>
      <div style={styles.splitBar} role="img" aria-label={parts.map((p) => `${p.label} ${percent(p.share, 0)}`).join(', ')}>
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${p.share * 100}%`, backgroundColor: p.color }} />
        ))}
      </div>
      <div style={{ ...styles.legend, color: theme.text.secondary }}>
        {parts.map((p) => (
          <span key={p.label} style={styles.legendItem}>
            <i style={{ ...styles.legendDot, backgroundColor: p.color }} />
            {p.label} <b style={{ color: theme.text.primary }}>{percent(p.share, 0)}</b>
          </span>
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
  legend: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '6px 16px',
    marginTop: '8px',
    fontSize: '13px',
  },
  legendItem: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
  },
  legendDot: {
    width: '9px',
    height: '9px',
    borderRadius: '3px',
  },
};
