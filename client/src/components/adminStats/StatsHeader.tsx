import type { StatsRange } from '../../api';
import { getTheme } from '../../theme';
import { number, RANGE_LABELS } from './format';
import { statsStyles } from './styles';

const LIVE_COLOR = '#2fb463';

type StatsHeaderProps = {
  inView: number;
  live: boolean;
  onToggleLive: () => void;
  onSignOut: () => void;
};

export function StatsHeader({ inView, live, onToggleLive, onSignOut }: StatsHeaderProps) {
  const theme = getTheme();
  const ghost = { ...statsStyles.ghost, color: theme.text.secondary, borderColor: theme.border };
  return (
    <div style={styles.header}>
      <div style={styles.titleRow}>
        <h1 style={{ ...statsStyles.title, color: theme.text.primary }}>Stats</h1>
        <span style={{ ...styles.live, color: theme.text.secondary }} title="Visitors with the site open in view right now">
          <span style={{ ...styles.liveDot, backgroundColor: live && inView > 0 ? LIVE_COLOR : theme.text.tertiary }} />
          {number(inView)} on the site now
        </span>
      </div>
      <div style={statsStyles.row}>
        <button
          type="button"
          onClick={onToggleLive}
          aria-pressed={live}
          title={live ? 'Updating as it happens. Click to pause.' : 'Paused. Click to update as it happens again.'}
          style={{ ...ghost, ...styles.liveButton }}
        >
          <span style={{ ...styles.liveDot, backgroundColor: live ? LIVE_COLOR : theme.text.tertiary }} />
          {live ? 'Live' : 'Paused'}
        </button>
        <button type="button" onClick={onSignOut} style={ghost}>
          Forget token
        </button>
      </div>
    </div>
  );
}

export function RangeTabs({ ranges, selected, onSelect }: { ranges: StatsRange[]; selected: StatsRange['key']; onSelect: (key: StatsRange['key']) => void }) {
  const theme = getTheme();
  return (
    <div role="tablist" aria-label="Period" style={{ ...styles.tabs, backgroundColor: theme.bg.tertiary }}>
      {ranges.map((r) => {
        const active = r.key === selected;
        return (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(r.key)}
            style={{
              ...styles.tab,
              backgroundColor: active ? theme.bg.secondary : 'transparent',
              color: active ? theme.text.primary : theme.text.secondary,
              boxShadow: active ? 'var(--panel-shadow)' : 'none',
            }}
          >
            {RANGE_LABELS[r.key]}
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  header: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  titleRow: {
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    gap: '14px',
    flexWrap: 'wrap' as const,
  },
  live: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    fontSize: '14px',
    fontWeight: 600 as const,
  },
  liveButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  tabs: {
    display: 'flex' as const,
    gap: '4px',
    padding: '4px',
    borderRadius: '10px',
    alignSelf: 'flex-start' as const,
  },
  tab: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
};
