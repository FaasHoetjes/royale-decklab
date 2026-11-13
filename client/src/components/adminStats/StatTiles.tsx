import type { StatsRange } from '../../api';
import { getTheme } from '../../theme';
import { changeFrom, duration, number, percent } from './format';
import { HINTS } from './hints';
import { statsStyles } from './styles';

const usersDetail = (range: StatsRange) => {
  const share = range.visitors > 0 ? `${percent(range.users, range.visitors)} of visitors looked up a player` : 'Looked up a player';
  const change = changeFrom(range.users, range.previousUsers);
  return change ? `${share} · ${change}` : share;
};

const timeDetail = (range: StatsRange) => {
  if (range.timeMedian === null) return 'Not measured yet';
  const change = changeFrom(range.timeMedian, range.previousTimeMedian);
  return change ? `Median · ${change}` : 'Median';
};

const pageviewsDetail = (range: StatsRange) => {
  const perVisitor = range.visitors > 0 ? `${(range.pageviews / range.visitors).toFixed(1)} per visitor` : undefined;
  const change = changeFrom(range.pageviews, range.previousPageviews);
  return [perVisitor, change].filter(Boolean).join(' · ') || undefined;
};

const lookupsDetail = (range: StatsRange) =>
  range.users > 0 ? `${(range.lookups / range.users).toFixed(1)} per user` : undefined;

export function StatTiles({ range }: { range: StatsRange }) {
  const showReturning = range.from !== range.to;
  return (
    <div style={styles.groups}>
      <div style={styles.tiles}>
        <Tile label="Visitors" hint={HINTS.visitors} value={number(range.visitors)} detail={changeFrom(range.visitors, range.previousVisitors)} />
        <Tile label="Pageviews" hint={HINTS.pageviews} value={number(range.pageviews)} detail={pageviewsDetail(range)} />
        <Tile label="Active users" hint={HINTS.activeUsers} value={number(range.users)} detail={usersDetail(range)} />
        <Tile label="Player lookups" hint={HINTS.lookups} value={number(range.lookups)} detail={lookupsDetail(range)} />
      </div>
      <div style={styles.tiles}>
        <Tile label="Unique players" hint={HINTS.uniquePlayers} value={number(range.players)} />
        {showReturning && <Tile label="Returning users" hint={HINTS.returning} value={percent(range.returning, range.users)} detail={`${number(range.returning)} on more than one day`} />}
        <Tile label="Time on site" hint={HINTS.timeOnSite} value={range.timeMedian === null ? '–' : duration(range.timeMedian)} detail={timeDetail(range)} />
      </div>
    </div>
  );
}

function Tile({ label, hint, value, detail }: { label: string; hint: string; value: string; detail?: string }) {
  const theme = getTheme();
  return (
    <div style={styles.tile} title={hint}>
      <span style={{ ...styles.label, ...statsStyles.hinted, color: theme.text.secondary }}>{label}</span>
      <span style={{ ...styles.value, color: theme.text.primary }}>{value}</span>
      {detail && <span style={{ ...styles.detail, color: theme.text.tertiary }}>{detail}</span>}
    </div>
  );
}

const styles = {
  groups: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '12px',
  },
  tiles: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
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
