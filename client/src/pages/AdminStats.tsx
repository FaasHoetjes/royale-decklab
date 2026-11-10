import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError, fetchAdminStats, type StatsCount, type StatsDuration, type StatsFilters, type StatsRange } from '../api';
import { ActivityChart } from '../components/adminStats/ActivityChart';
import { Breakdown } from '../components/adminStats/Breakdown';
import { DeckExports } from '../components/adminStats/DeckExports';
import { FilterBar } from '../components/adminStats/FilterBar';
import { countryLabel, deviceLabel, number, sourceLabel, toolLabel } from '../components/adminStats/format';
import { Gate, TokenForm } from '../components/adminStats/Gate';
import { MonthsTable } from '../components/adminStats/MonthsTable';
import { SharingFunnel } from '../components/adminStats/SharingFunnel';
import { StatTiles } from '../components/adminStats/StatTiles';
import { RangeTabs, StatsHeader } from '../components/adminStats/StatsHeader';
import { statsStyles } from '../components/adminStats/styles';
import { useLiveInView } from '../hooks/useLiveInView';
import { readAdminToken, saveAdminToken } from '../lib/adminToken';
import { excludeThisBrowser } from '../lib/stats';
import { getTheme } from '../theme';

const FILTER_KEYS = ['source', 'country', 'device'] as const;
const LIVE_REFRESH_MS = 30_000;
const REFRESH_MS = 60_000;
// Below this, one visitor who left a tab open would set a source's time on their own.
const MIN_TIMED_VISITORS = 3;

const activeFilters = (filters: StatsFilters): [keyof StatsFilters, string][] =>
  FILTER_KEYS.flatMap((name): [keyof StatsFilters, string][] => {
    const key = filters[name];
    return key ? [[name, key]] : [];
  });

const toMap = (counts: StatsCount[]) => new Map(counts.map((c) => [c.key, c.users]));

const timesOf = (durations: StatsDuration[]) =>
  new Map(durations.filter((d) => d.visitors >= MIN_TIMED_VISITORS).map((d) => [d.key, d.seconds]));

/** The hours come in UTC; this shows them on the viewer's clock. */
const localHour = (day: string) => (key: string) =>
  new Date(`${day}T${key}:00:00Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayLabel = (key: string) => key;

export default function AdminStats() {
  const theme = getTheme();
  const [token, setToken] = useState(readAdminToken);
  const [rangeKey, setRangeKey] = useState<StatsRange['key']>('7d');
  const [wrongToken, setWrongToken] = useState(false);
  const [filters, setFilters] = useState<StatsFilters>({});
  const [live, setLive] = useState(true);

  const stats = useQuery({
    queryKey: ['admin-stats', token, filters],
    queryFn: ({ signal }) => fetchAdminStats(token, filters, signal),
    enabled: token !== '',
    retry: false,
    staleTime: LIVE_REFRESH_MS,
    refetchInterval: live && (rangeKey === 'today' ? LIVE_REFRESH_MS : REFRESH_MS),
    refetchOnWindowFocus: live,
    placeholderData: keepPreviousData,
  });

  const liveInView = useLiveInView(live && stats.isSuccess ? token : '');

  const status = stats.error instanceof ApiError ? stats.error.status : null;
  const rejected = status === 401 || status === 403;

  useEffect(() => {
    if (stats.isSuccess) excludeThisBrowser();
  }, [stats.isSuccess]);

  useEffect(() => {
    if (rejected) {
      saveAdminToken('');
      setToken('');
      setWrongToken(true);
    }
  }, [rejected]);

  const signIn = (value: string) => {
    saveAdminToken(value);
    setToken(value);
    setWrongToken(false);
  };

  const signOut = () => {
    saveAdminToken('');
    setToken('');
  };

  const toggleLive = () => {
    if (!live) stats.refetch();
    setLive(!live);
  };

  const toggleFilter = (name: keyof StatsFilters, key: string) =>
    setFilters((current) => ({ ...current, [name]: current[name] === key ? undefined : key }));

  if (!token) {
    return (
      <Gate>
        <TokenForm wrongToken={wrongToken} onSubmit={signIn} />
      </Gate>
    );
  }

  if (stats.isPending) {
    return (
      <Gate>
        <p style={{ color: theme.text.secondary }}>Loading…</p>
      </Gate>
    );
  }

  if (!stats.data) {
    return (
      <Gate>
        <p style={{ color: theme.text.secondary }}>
          {status === 429 ? 'Too many tries. Wait a minute and try again.' : 'The stats couldn’t be loaded.'}
        </p>
        <div style={{ ...statsStyles.row, justifyContent: 'center' }}>
          <button type="button" onClick={() => stats.refetch()} style={{ ...statsStyles.button, backgroundColor: theme.accent, color: theme.onAccent }}>
            Try again
          </button>
          <button type="button" onClick={signOut} style={{ ...statsStyles.ghost, color: theme.text.secondary, borderColor: theme.border }}>
            Forget token
          </button>
        </div>
      </Gate>
    );
  }

  const report = stats.data;
  const range = report.ranges.find((r) => r.key === rangeKey) ?? report.ranges[0];
  if (!range) return null;
  const filtersShown = activeFilters(filters);
  const isToday = range.key === 'today';
  const chartPoints = isToday ? range.hourly ?? [] : range.daily;
  const period = range.from === range.to ? range.from : `${range.from} to ${range.to}`;

  return (
    <div style={styles.page}>
      <StatsHeader inView={liveInView ?? report.inView} live={live} onToggleLive={toggleLive} onSignOut={signOut} />
      <RangeTabs ranges={report.ranges} selected={range.key} onSelect={setRangeKey} />
      {filtersShown.length > 0 && <FilterBar filters={filtersShown} onRemove={toggleFilter} onClear={() => setFilters({})} />}

      <p style={{ ...statsStyles.note, color: theme.text.tertiary }}>
        {period} (UTC) · Updated {new Date(stats.dataUpdatedAt).toLocaleTimeString()}
        {live && stats.isError && ' · Couldn’t refresh, trying again in a minute'}
      </p>

      <StatTiles range={range} />

      {chartPoints.length > 0 && (
        <section style={statsStyles.panel}>
          <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>{isToday ? 'Today, per hour (your time)' : 'Per day'}</h2>
          <ActivityChart points={chartPoints} previous={isToday ? null : range.previousDaily} keyLabel={isToday ? localHour(range.from) : dayLabel} />
        </section>
      )}

      <DeckExports range={range} />
      <SharingFunnel range={range} />

      <div style={styles.grid}>
        <Breakdown
          title="Countries"
          counts={range.countries}
          total={range.visitors}
          label={countryLabel}
          lookedUp={toMap(range.countryUsers)}
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
          lookedUp={toMap(range.sourceUsers)}
          times={timesOf(range.sourceTime)}
          selected={filters.source}
          onSelect={(key) => toggleFilter('source', key)}
          extra={range.campaigns.length > 0 ? { title: 'Campaign links', counts: range.campaigns } : undefined}
        />
        <Breakdown title="Which tools are used" counts={range.tools} label={toolLabel} />
      </div>

      <section style={{ ...statsStyles.panel, ...styles.webhooks }}>
        <h2 style={{ ...statsStyles.heading, ...styles.webhooksHeading, color: theme.text.primary }}>Discord webhooks registered</h2>
        <span style={{ ...styles.webhooksValue, color: theme.text.primary }}>{number(report.discordWebhooks)}</span>
      </section>

      {report.months.length > 0 && <MonthsTable months={report.months} />}

      <p style={{ ...statsStyles.note, color: theme.text.tertiary }}>
        Visits are kept for {report.retentionDays} days, then only the totals remain. Bots, and browsers that opened this page, aren't counted. Click a country, device or source to filter the page by it.
      </p>
    </div>
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
  webhooks: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
  },
  webhooksHeading: {
    margin: 0,
  },
  webhooksValue: {
    fontSize: '24px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  grid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '16px',
  },
};
