import type { StatsRange } from '../../api';
import { getTheme } from '../../theme';
import { changeFrom, number, percent } from './format';

const usersDetail = (range: StatsRange) => {
  const share = range.visitors > 0 ? `${percent(range.users, range.visitors)} of visitors looked up a player` : 'Looked up a player';
  const change = changeFrom(range.users, range.previousUsers);
  return change ? `${share} · ${change}` : share;
};

const lookupsDetail = (range: StatsRange) =>
  range.users > 0 ? `${(range.lookups / range.users).toFixed(1)} per user` : undefined;

export function StatTiles({ range }: { range: StatsRange }) {
  return (
    <div style={styles.tiles}>
      <Tile label="Visitors (any page)" value={number(range.visitors)} detail={changeFrom(range.visitors, range.previousVisitors)} />
      <Tile label="Real users" value={number(range.users)} detail={usersDetail(range)} />
      <Tile label="Player lookups" value={number(range.lookups)} detail={lookupsDetail(range)} />
      <Tile label="Different players" value={number(range.players)} />
      <Tile label="Came back" value={percent(range.returning, range.users)} detail={`${number(range.returning)} on more than one day`} />
    </div>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const theme = getTheme();
  return (
    <div style={styles.tile}>
      <span style={{ ...styles.label, color: theme.text.secondary }}>{label}</span>
      <span style={{ ...styles.value, color: theme.text.primary }}>{value}</span>
      {detail && <span style={{ ...styles.detail, color: theme.text.tertiary }}>{detail}</span>}
    </div>
  );
}

const styles = {
  tiles: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
  },
  tile: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
    boxShadow: 'var(--panel-shadow)',
    borderRadius: '16px',
    padding: '14px 16px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600 as const,
  },
  value: {
    fontSize: '28px',
    fontWeight: 800 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  detail: {
    fontSize: '12px',
  },
};
