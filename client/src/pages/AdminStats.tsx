import { useEffect, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError, fetchAdminStats, type StatsCount, type StatsFilters, type StatsPoint, type StatsRange } from '../api';
import { excludeThisBrowser } from '../lib/stats';
import { getTheme } from '../theme';

// Session storage only: the token is gone once the tab closes.
const TOKEN_KEY = 'adminToken';

const RANGE_LABELS: Record<StatsRange['key'], string> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direct or unknown',
  reddit: 'Reddit',
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  ai: 'AI assistants',
  discord: 'Discord',
  youtube: 'YouTube',
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  other: 'Other sites',
};

const TOOL_LABELS: Record<string, string> = {
  home: 'Start page',
  generator: 'War deck generator',
  builder: 'Deck builder',
  upgrades: 'Upgrade advisor',
  'best-decks': 'Best decks',
  cards: 'Cards list',
  card: 'Card pages',
  faq: 'FAQ',
};

const DEVICE_LABELS: Record<string, string> = { phone: 'Phone', desktop: 'Desktop' };

const FILTER_NAMES: Record<keyof StatsFilters, string> = { source: 'Source', country: 'Country', device: 'Device' };

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

const countryLabel = (key: string) => (key === 'XX' ? 'Unknown' : countryNames?.of(key) ?? key);
const sourceLabel = (key: string) => SOURCE_LABELS[key] ?? key;
const deviceLabel = (key: string) => DEVICE_LABELS[key] ?? key;
const FILTER_LABELS: Record<keyof StatsFilters, (key: string) => string> = { source: sourceLabel, country: countryLabel, device: deviceLabel };

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // The token then lasts only as long as this page.
  }
}

const number = (value: number) => value.toLocaleString('en-US');
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–');

function changeFrom(now: number, before: number | null): string | undefined {
  if (!before) return undefined;
  const change = Math.round(((now - before) / before) * 100);
  return `${change >= 0 ? '+' : ''}${change}% vs the period before`;
}

export default function AdminStats() {
  const theme = getTheme();
  const [token, setToken] = useState(readToken);
  const [draft, setDraft] = useState('');
  const [rangeKey, setRangeKey] = useState<StatsRange['key']>('7d');
  const [wrongToken, setWrongToken] = useState(false);
  const [filters, setFilters] = useState<StatsFilters>({});

  const stats = useQuery({
    queryKey: ['admin-stats', token, filters],
    queryFn: ({ signal }) => fetchAdminStats(token, filters, signal),
    enabled: token !== '',
    retry: false,
    staleTime: 30_000,
    refetchInterval: rangeKey === 'today' ? 30_000 : 60_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });

  const toggleFilter = (name: keyof StatsFilters, key: string) =>
    setFilters((current) => ({ ...current, [name]: current[name] === key ? undefined : key }));

  const status = stats.error instanceof ApiError ? stats.error.status : null;
  const rejected = status === 401 || status === 403;

  useEffect(() => {
    if (stats.isSuccess) excludeThisBrowser();
  }, [stats.isSuccess]);

  useEffect(() => {
    if (rejected) {
      saveToken('');
      setToken('');
      setWrongToken(true);
    }
  }, [rejected]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    saveToken(value);
    setToken(value);
    setDraft('');
    setWrongToken(false);
  };

  const signOut = () => {
    saveToken('');
    setToken('');
  };

  if (!token) {
    return (
      <div style={styles.gate}>
        <h1 style={{ ...styles.title, color: theme.text.primary }}>Stats</h1>
        <form onSubmit={submit} style={{ ...styles.panel, ...styles.form }}>
          <label htmlFor="admin-token" style={{ color: theme.text.secondary }}>Admin token</label>
          <input
            id="admin-token"
            type="password"
            autoComplete="current-password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ ...styles.input, backgroundColor: theme.control.bg, color: theme.control.text, borderColor: theme.control.border }}
          />
          <button type="submit" style={{ ...styles.button, backgroundColor: theme.accent, color: theme.onAccent }}>
            Show stats
          </button>
          {wrongToken && <p style={{ ...styles.note, color: theme.text.secondary }}>That token wasn't accepted.</p>}
        </form>
      </div>
    );
  }

  if (stats.isPending) {
    return (
      <div style={styles.gate}>
        <h1 style={{ ...styles.title, color: theme.text.primary }}>Stats</h1>
        <p style={{ color: theme.text.secondary }}>Loading…</p>
      </div>
    );
  }

  if (!stats.data) {
    return (
      <div style={styles.gate}>
        <h1 style={{ ...styles.title, color: theme.text.primary }}>Stats</h1>
        <p style={{ color: theme.text.secondary }}>
          {status === 429 ? 'Too many tries. Wait a minute and try again.' : 'The stats couldn’t be loaded.'}
        </p>
        <div style={{ ...styles.row, justifyContent: 'center' }}>
          <button type="button" onClick={() => stats.refetch()} style={{ ...styles.button, backgroundColor: theme.accent, color: theme.onAccent }}>
            Try again
          </button>
          <button type="button" onClick={signOut} style={{ ...styles.ghost, color: theme.text.secondary, borderColor: theme.border }}>
            Forget token
          </button>
        </div>
      </div>
    );
  }

  const report = stats.data;
  const range = report.ranges.find((r) => r.key === rangeKey) ?? report.ranges[0];
  if (!range) return null;
  const activeFilters = (Object.entries(filters) as [keyof StatsFilters, string | undefined][])
    .filter((entry): entry is [keyof StatsFilters, string] => !!entry[1]);
  const chartPoints = range.key === 'today' ? range.hourly ?? [] : range.daily;
  const sourceUsers = new Map(range.sourceUsers.map((c) => [c.key, c.users]));
  const countryUsers = new Map(range.countryUsers.map((c) => [c.key, c.users]));

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <h1 style={{ ...styles.title, color: theme.text.primary }}>Stats</h1>
          <span style={{ ...styles.live, color: theme.text.secondary }} title="Visitors who opened a page in the last 5 minutes">
            <span style={{ ...styles.liveDot, backgroundColor: report.activeNow > 0 ? '#2fb463' : theme.text.tertiary }} />
            {number(report.activeNow)} on the site now
          </span>
        </div>
        <div style={styles.row}>
          <button type="button" onClick={() => stats.refetch()} disabled={stats.isFetching} style={{ ...styles.ghost, color: theme.text.secondary, borderColor: theme.border }}>
            {stats.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" onClick={signOut} style={{ ...styles.ghost, color: theme.text.secondary, borderColor: theme.border }}>
            Forget token
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Period" style={{ ...styles.tabs, backgroundColor: theme.bg.tertiary }}>
        {report.ranges.map((r) => {
          const active = r.key === range.key;
          return (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setRangeKey(r.key)}
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

      {activeFilters.length > 0 && (
        <div style={styles.filterBar}>
          {activeFilters.map(([name, key]) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleFilter(name, key)}
              aria-label={`Remove filter ${FILTER_NAMES[name]}: ${FILTER_LABELS[name](key)}`}
              style={{ ...styles.chip, backgroundColor: theme.accent, color: theme.onAccent }}
            >
              {FILTER_NAMES[name]}: {FILTER_LABELS[name](key)} ✕
            </button>
          ))}
          <button type="button" onClick={() => setFilters({})} style={{ ...styles.link, alignSelf: 'center', color: theme.accent }}>
            Clear filters
          </button>
          <span style={{ ...styles.note, color: theme.text.tertiary }}>Only visitors who match, within the period. The months table isn't filtered.</span>
        </div>
      )}

      <p style={{ ...styles.note, color: theme.text.tertiary }}>
        {range.from === range.to ? range.from : `${range.from} to ${range.to}`} (UTC) · Updated {new Date(stats.dataUpdatedAt).toLocaleTimeString()}
        {stats.isError && ' · Couldn’t refresh, trying again in a minute'}
        {range.spansMonths && ' · People who came in both months count twice here, as their anonymous code changes each month.'}
      </p>

      <div style={styles.tiles}>
        <Tile label="Visitors (any page)" value={number(range.visitors)} detail={changeFrom(range.visitors, range.previousVisitors)} />
        <Tile label="Real users" value={number(range.users)} detail={[range.visitors > 0 ? `${percent(range.users, range.visitors)} of visitors looked up a player` : 'Looked up a player', changeFrom(range.users, range.previousUsers)].filter(Boolean).join(' · ')} />
        <Tile label="Player lookups" value={number(range.lookups)} detail={range.users > 0 ? `${(range.lookups / range.users).toFixed(1)} per user` : undefined} />
        <Tile label="Different players" value={number(range.players)} />
        <Tile label="Came back" value={percent(range.returning, range.users)} detail={`${number(range.returning)} on more than one day`} />
      </div>

      {chartPoints.length > 0 && (
        <section style={styles.panel}>
          <h2 style={{ ...styles.heading, color: theme.text.primary }}>{range.key === 'today' ? 'Today, per hour (UTC)' : 'Per day'}</h2>
          <ActivityChart
            points={chartPoints}
            previous={range.key === 'today' ? null : range.previousDaily}
            keyLabel={range.key === 'today' ? (key) => `${key}:00` : (key) => key}
          />
        </section>
      )}

      <section style={styles.panel}>
        <h2 style={{ ...styles.heading, color: theme.text.primary }}>Sharing</h2>
        <Funnel
          steps={[
            { label: 'Share taps', value: range.shareTaps },
            { label: 'Links posted (approx.)', value: range.previews, hint: 'Link previews fetched by Discord, WhatsApp and the like' },
            { label: 'Shared decks opened', value: range.shareOpens },
            { label: 'New users from sharing', value: range.newFromShare, hint: 'Opened a shared lineup, then looked up a different player within 7 days' },
          ]}
        />
      </section>

      <div style={styles.grid}>
        <Breakdown
          title="Countries"
          counts={range.countries}
          total={range.visitors}
          label={countryLabel}
          lookedUp={countryUsers}
          selected={filters.country}
          onSelect={(key) => toggleFilter('country', key)}
        />
        <Breakdown
          title="Phone or desktop"
          counts={range.devices}
          total={range.users}
          label={deviceLabel}
          selected={filters.device}
          onSelect={(key) => toggleFilter('device', key)}
        />
        <Breakdown
          title="Where users came from"
          counts={range.sources}
          total={range.visitors}
          label={sourceLabel}
          lookedUp={sourceUsers}
          selected={filters.source}
          onSelect={(key) => toggleFilter('source', key)}
          extra={range.campaigns.length > 0 ? { title: 'Campaign links', counts: range.campaigns } : undefined}
        />
        <Breakdown title="Which tools are used" counts={range.tools} label={(key) => TOOL_LABELS[key] ?? key} />
      </div>

      {report.months.length > 0 && (
        <section style={styles.panel}>
          <h2 style={{ ...styles.heading, color: theme.text.primary }}>Months</h2>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={{ color: theme.text.tertiary }}>
                  <th style={styles.th}>Month</th>
                  <th style={styles.thNumber}>Visitors</th>
                  <th style={styles.thNumber}>Users</th>
                  <th style={styles.thNumber}>Lookups</th>
                  <th style={styles.thNumber}>Players</th>
                  <th style={styles.thNumber}>Shares opened</th>
                  <th style={styles.thNumber}>New from sharing</th>
                </tr>
              </thead>
              <tbody>
                {report.months.map((m) => (
                  <tr key={m.month} style={{ color: theme.text.primary, borderTop: `1px solid ${theme.border}` }}>
                    <td style={styles.td}>
                      {m.month}
                      {m.partial && <span style={{ color: theme.text.tertiary }}> (so far)</span>}
                    </td>
                    <td style={styles.tdNumber}>{number(m.visitors)}</td>
                    <td style={styles.tdNumber}>{number(m.users)}</td>
                    <td style={styles.tdNumber}>{number(m.lookups)}</td>
                    <td style={styles.tdNumber}>{number(m.players)}</td>
                    <td style={styles.tdNumber}>{number(m.shareOpens)}</td>
                    <td style={styles.tdNumber}>{number(m.newFromShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p style={{ ...styles.note, color: theme.text.tertiary }}>
        Visits are kept for {report.retentionDays} days, then only the totals remain. Bots, and browsers that opened this page, aren't counted. Click a country, device or source to filter the page by it.
      </p>
    </div>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const theme = getTheme();
  return (
    <div style={styles.tile}>
      <span style={{ ...styles.tileLabel, color: theme.text.secondary }}>{label}</span>
      <span style={{ ...styles.tileValue, color: theme.text.primary }}>{value}</span>
      {detail && <span style={{ ...styles.tileDetail, color: theme.text.tertiary }}>{detail}</span>}
    </div>
  );
}

function ActivityChart({ points, previous, keyLabel }: { points: StatsPoint[]; previous: StatsPoint[] | null; keyLabel: (key: string) => string }) {
  const theme = getTheme();
  const max = Math.max(1, ...points.map((p) => p.visitors), ...(previous ?? []).map((p) => p.visitors));
  const y = (value: number) => 100 - (value / max) * 100;
  const last = points.length - 1;
  return (
    <div>
      <svg viewBox={`0 0 ${points.length * 10} 100`} preserveAspectRatio="none" width="100%" height="160" role="img" aria-label="Visitors and real users per period" style={styles.chart}>
        {points.map((p, i) => (
          <g key={p.key} opacity={i === last ? 0.45 : 1}>
            <title>{`${keyLabel(p.key)}${i === last ? ' (so far)' : ''}: ${number(p.visitors)} visitors, ${number(p.users)} real users${previous?.[i] ? `, ${number(previous[i].visitors)} visitors the period before` : ''}`}</title>
            <rect x={i * 10 + 1} y={y(p.visitors)} width={8} height={100 - y(p.visitors)} fill="var(--accent)" fillOpacity={0.3} />
            <rect x={i * 10 + 1} y={y(p.users)} width={8} height={100 - y(p.users)} fill="var(--accent)" />
          </g>
        ))}
        {previous && previous.length > 1 && (
          <polyline
            points={previous.map((p, i) => `${i * 10 + 5},${y(p.visitors)}`).join(' ')}
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div style={{ ...styles.barAxis, color: theme.text.tertiary }}>
        <span>{points[0] && keyLabel(points[0].key)}</span>
        <span>max {number(max)}</span>
        <span>{points[last] && keyLabel(points[last].key)}</span>
      </div>
      <div style={{ ...styles.legend, color: theme.text.secondary }}>
        <span style={styles.legendItem}><span style={{ ...styles.swatch, backgroundColor: theme.accent, opacity: 0.3 }} />Visitors</span>
        <span style={styles.legendItem}><span style={{ ...styles.swatch, backgroundColor: theme.accent }} />Real users</span>
        {previous && <span style={styles.legendItem}><span style={{ ...styles.dash, borderColor: theme.text.secondary }} />Visitors, period before</span>}
        <span style={styles.legendItem}><span style={{ ...styles.swatch, backgroundColor: theme.accent, opacity: 0.45 }} />Faded: still in progress</span>
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number; hint?: string }[] }) {
  const theme = getTheme();
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div style={styles.list}>
      {steps.map((s) => (
        <div key={s.label} title={s.hint}>
          <div style={styles.listRow}>
            <span style={{ color: theme.text.primary }}>{s.label}</span>
            <span style={{ ...styles.listValue, color: theme.text.primary }}>{number(s.value)}</span>
          </div>
          <div style={{ ...styles.track, backgroundColor: theme.bg.tertiary }}>
            <div style={{ ...styles.fill, width: `${(s.value / max) * 100}%`, backgroundColor: theme.accent }} />
          </div>
        </div>
      ))}
    </div>
  );
}

type BreakdownProps = {
  title: string;
  counts: StatsCount[];
  /** Without a total, the counts aren't shares of the users above (tools count every visitor), so bars scale to the largest. */
  total?: number;
  label: (key: string) => string;
  /** How many of each row's visitors looked up a player. */
  lookedUp?: Map<string, number>;
  selected?: string;
  onSelect?: (key: string) => void;
  extra?: { title: string; counts: StatsCount[] };
};

function Breakdown({ title, counts, total, label, lookedUp, selected, onSelect, extra }: BreakdownProps) {
  const theme = getTheme();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? counts : counts.slice(0, 8);
  const scale = total ?? Math.max(1, ...counts.map((c) => c.users));
  return (
    <section style={styles.panel}>
      <h2 style={{ ...styles.heading, color: theme.text.primary }}>{title}</h2>
      {counts.length === 0 ? (
        <p style={{ ...styles.note, color: theme.text.tertiary }}>Nothing yet.</p>
      ) : (
        <div style={styles.list}>
          {shown.map((c) => {
            const row = (
              <>
                <div style={styles.listRow}>
                  <span style={{ color: theme.text.primary, fontWeight: selected === c.key ? 700 : 400 }}>
                    {label(c.key)}
                    {lookedUp && c.users > 0 && (
                      <span style={{ ...styles.lookedUp, color: theme.text.tertiary }}> · {percent(lookedUp.get(c.key) ?? 0, c.users)} looked up</span>
                    )}
                  </span>
                  <span style={{ ...styles.listValue, color: theme.text.secondary }}>
                    {total === undefined ? number(c.users) : `${number(c.users)} · ${percent(c.users, total)}`}
                  </span>
                </div>
                <div style={{ ...styles.track, backgroundColor: theme.bg.tertiary }}>
                  <div style={{ ...styles.fill, width: `${scale > 0 ? Math.min(100, (c.users / scale) * 100) : 0}%`, backgroundColor: theme.accent }} />
                </div>
              </>
            );
            return onSelect ? (
              <button
                key={c.key}
                type="button"
                onClick={() => onSelect(c.key)}
                aria-pressed={selected === c.key}
                title={selected === c.key ? 'Remove this filter' : 'Show only these visitors'}
                style={styles.rowButton}
              >
                {row}
              </button>
            ) : (
              <div key={c.key}>{row}</div>
            );
          })}
          {counts.length > 8 && (
            <button type="button" onClick={() => setExpanded(!expanded)} style={{ ...styles.link, color: theme.accent }}>
              {expanded ? 'Show fewer' : `Show all ${counts.length}`}
            </button>
          )}
        </div>
      )}
      {extra && (
        <>
          <h3 style={{ ...styles.subheading, color: theme.text.secondary }}>{extra.title}</h3>
          <div style={styles.list}>
            {extra.counts.slice(0, 8).map((c) => (
              <div key={c.key} style={styles.listRow}>
                <span style={{ color: theme.text.primary }}>{c.key}</span>
                <span style={{ ...styles.listValue, color: theme.text.secondary }}>{number(c.users)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const styles = {
  page: {
    maxWidth: '960px',
    margin: '0 auto',
    padding: '24px 16px 48px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '16px',
  },
  header: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  title: {
    margin: 0,
    fontSize: '28px',
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
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  filterBar: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    flexWrap: 'wrap' as const,
  },
  chip: {
    padding: '6px 12px',
    borderRadius: '999px',
    border: 'none',
    fontWeight: 600 as const,
    fontSize: '13px',
    cursor: 'pointer',
  },
  rowButton: {
    display: 'block' as const,
    width: '100%',
    padding: 0,
    border: 'none',
    background: 'none',
    font: 'inherit',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  lookedUp: {
    fontSize: '12px',
  },
  subheading: {
    margin: '16px 0 8px',
    fontSize: '13px',
  },
  chart: {
    display: 'block' as const,
  },
  legend: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '6px 16px',
    fontSize: '12px',
    marginTop: '10px',
  },
  legendItem: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
  },
  swatch: {
    width: '10px',
    height: '10px',
    borderRadius: '2px',
  },
  dash: {
    width: '14px',
    borderTop: '2px dashed',
  },
  row: {
    display: 'flex' as const,
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  panel: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
    boxShadow: 'var(--panel-shadow)',
    borderRadius: '16px',
    padding: '16px',
    minWidth: 0,
  },
  gate: {
    maxWidth: '400px',
    margin: '0 auto',
    padding: '80px 16px 48px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: '16px',
    textAlign: 'center' as const,
  },
  form: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '10px',
    width: '100%',
    maxWidth: '360px',
    textAlign: 'left' as const,
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '16px',
  },
  button: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 700 as const,
    cursor: 'pointer',
  },
  ghost: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid',
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  link: {
    alignSelf: 'flex-start' as const,
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontWeight: 600 as const,
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
  note: {
    margin: 0,
    fontSize: '13px',
  },
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
  tileLabel: {
    fontSize: '13px',
    fontWeight: 600 as const,
  },
  tileValue: {
    fontSize: '28px',
    fontWeight: 800 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  tileDetail: {
    fontSize: '12px',
  },
  heading: {
    margin: '0 0 12px',
    fontSize: '16px',
  },
  barAxis: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    fontSize: '12px',
    marginTop: '6px',
  },
  grid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '16px',
  },
  list: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '10px',
  },
  listRow: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
    fontSize: '14px',
    marginBottom: '4px',
  },
  listValue: {
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
  track: {
    height: '6px',
    borderRadius: '3px',
    overflow: 'hidden' as const,
  },
  fill: {
    height: '100%',
    borderRadius: '3px',
  },
  tableWrap: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  th: {
    textAlign: 'left' as const,
    fontWeight: 600 as const,
    padding: '6px 8px',
    whiteSpace: 'nowrap' as const,
  },
  thNumber: {
    textAlign: 'right' as const,
    fontWeight: 600 as const,
    padding: '6px 8px',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '8px',
    whiteSpace: 'nowrap' as const,
  },
  tdNumber: {
    padding: '8px',
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
};
