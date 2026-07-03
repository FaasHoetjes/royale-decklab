import CardTile from './CardTile';
import { cardIconUrl, displayLevel } from '../lib/cardDisplay';
import type { UpgradeSuggestion } from '../api';
import type { Theme } from '../theme';

interface UpgradeRowProps {
  rank: number;
  suggestion: UpgradeSuggestion;
  /** This suggestion's gain relative to the top one (0-1), drives the bar. */
  relativeGain: number;
  baselineScore: number;
  isDarkMode: boolean;
  theme: Theme;
  isMobile: boolean;
}

/** One ranked upgrade: card art, the level step, and its score gain. */
export default function UpgradeRow({
  rank,
  suggestion: s,
  relativeGain,
  baselineScore,
  isDarkMode,
  theme,
  isMobile,
}: UpgradeRowProps) {
  const gainPct = baselineScore > 0 ? (s.scoreDelta / baselineScore) * 100 : 0;
  const decksLabel = s.affectedDeckIndexes.map((i) => `Deck ${i + 1}`).join(' · ');

  return (
    <div style={{ ...styles.row, padding: isMobile ? '12px 12px' : '14px 18px' }}>
      <div style={{ ...styles.rank, color: theme.text.tertiary }}>#{rank}</div>
      <div style={{ width: isMobile ? '44px' : '54px', flexShrink: 0 }}>
        <CardTile
          name={s.name ?? ''}
          iconUrl={cardIconUrl(s.iconUrls, 'normal')}
          isDarkMode={isDarkMode}
          showName={false}
        />
      </div>

      <div style={styles.info}>
        <div style={{ ...styles.name, color: theme.text.primary }}>{s.name}</div>
        <div style={{ ...styles.levels, color: theme.text.secondary }}>
          Level {displayLevel(s.fromLevel, s.maxLevel)} → {displayLevel(s.toLevel, s.maxLevel)}
        </div>
        {(decksLabel || s.changesLineup) && (
          <div style={styles.context}>
            {decksLabel && <span style={{ color: theme.text.tertiary }}>In {decksLabel}</span>}
            {s.changesLineup && (
              <span style={{ color: theme.accent, fontWeight: 600 }}>Unlocks a new deck</span>
            )}
          </div>
        )}
      </div>

      {!isMobile && (
        <div style={{ ...styles.bar, backgroundColor: theme.bg.tertiary }}>
          <div
            style={{
              ...styles.barFill,
              // Floor so even the smallest gain stays visible.
              width: `${Math.max(relativeGain * 100, 4)}%`,
              backgroundColor: theme.accent,
            }}
          />
        </div>
      )}

      <div style={styles.delta}>
        <div style={{ ...styles.deltaValue, color: theme.accent }}>+{s.scoreDelta.toFixed(3)}</div>
        <div style={{ ...styles.deltaPct, color: theme.text.tertiary }}>+{gainPct.toFixed(1)}%</div>
      </div>
    </div>
  );
}

const styles = {
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '14px',
  },
  rank: {
    width: '26px',
    flexShrink: 0,
    fontSize: '13px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: '15px',
    fontWeight: 700 as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  levels: {
    fontSize: '13px',
    marginTop: '2px',
  },
  context: {
    display: 'flex' as const,
    gap: '10px',
    fontSize: '12px',
    marginTop: '3px',
  },
  bar: {
    width: '140px',
    height: '6px',
    borderRadius: '3px',
    overflow: 'hidden' as const,
    flexShrink: 0,
  },
  barFill: {
    height: '100%',
    borderRadius: '3px',
  },
  delta: {
    width: '64px',
    flexShrink: 0,
    textAlign: 'right' as const,
  },
  deltaValue: {
    fontSize: '15px',
    fontWeight: 800 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  deltaPct: {
    fontSize: '11px',
    marginTop: '1px',
  },
};
