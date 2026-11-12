import { useMemo, useState } from 'react';
import { getTheme, type Theme } from '../theme';
import { useAllCards, useCardStats } from '../queries';
import type { CardStat, CardStatsResponse } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';
import { cardIconUrl } from '../lib/cardDisplay';
import { mostPlayedVersion } from '../lib/cardInfo';
import { isLowSample, percent, sortCardStats, type CardSort } from '../lib/cardStats';
import { toBuilderCards } from '../lib/builderCards';
import { EXCLUSIVE_TYPES, matchesFilters, type FilterKey } from '../lib/pickerData';
import CardTile from '../components/CardTile';
import CardLink from '../components/CardLink';
import WinRateChange from '../components/WinRateChange';
import FilterPopover from '../components/FilterPopover';
import LoadError from '../components/LoadError';
import { periodNote } from '../lib/statsPeriod';
import { SortSegment } from './CardSortSegment';

const EAGER_TILE_COUNT = 25;
const MOBILE_SKELETON_TILES = 16;
const DESKTOP_SKELETON_TILES = 30;

export default function Cards() {
  const theme = getTheme();
  const isMobile = useIsMobile();
  const catalog = useAllCards();
  const statsQuery = useCardStats();
  const [sort, setSort] = useState<CardSort>('Win rate');
  const [descending, setDescending] = useState(true);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const stats = statsQuery.data;
  const cards = useMemo(() => {
    if (!catalog.data || !stats) return [];
    const statById = new Map(stats.cards.map((s) => [s.id, s]));
    const builderById = new Map(toBuilderCards(catalog.data, []).map((c) => [c.id, c]));
    const needle = query.trim().toLowerCase();
    const shown = catalog.data.flatMap((card) => {
      const stat = statById.get(card.id);
      const builderCard = builderById.get(card.id);
      if (!stat || !builderCard || !matchesFilters(builderCard, filters)) return [];
      if (needle && !card.name.toLowerCase().includes(needle)) return [];
      return [{ card, stat }];
    });
    return sortCardStats(shown, sort, descending);
  }, [catalog.data, stats, sort, descending, query, filters]);

  const toggleFilter = (key: FilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) {
        if (EXCLUSIVE_TYPES.includes(key)) EXCLUSIVE_TYPES.forEach((k) => next.delete(k));
        next.add(key);
      }
      return next;
    });

  const failed = catalog.isError || statsQuery.isError;
  const loading = !failed && (!catalog.data || !stats);

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div style={{ marginBottom: isMobile ? '18px' : '26px' }}>
        <h1 className={isMobile ? 'visually-hidden' : undefined} style={{ color: theme.text.primary, margin: 0, fontSize: '1.5em' }}>Cards</h1>
        <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined, color: theme.text.secondary }}>
          <IntroSummary stats={stats} isMobile={isMobile} />
          {isMobile ? ' Tap a card for its detailed stats.' : <span style={{ display: 'block' }}>Click a card for its detailed stats.</span>}
        </p>
      </div>

      <div style={{ ...styles.controls, ...(isMobile ? styles.controlsMobile : {}) }}>
        <SortSegment value={sort} onPick={setSort} isMobile={isMobile} />
        <div style={{ ...styles.controlRow, ...(isMobile ? { width: '100%' } : {}) }}>
          <input
            type="search"
            className="mobile-touch-target"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards…"
            aria-label="Search cards by name"
            style={{
              ...styles.search,
              ...(isMobile ? { flex: 1, width: 'auto', minWidth: 0, fontSize: '16px' } : {}),
              backgroundColor: theme.control.bg,
              color: theme.control.text,
              border: `1px solid ${theme.control.border}`,
            }}
          />
          <div style={styles.filterWrap}>
            <button
              type="button"
              className="mobile-touch-target"
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              aria-label="Filter cards by type"
              style={{
                ...styles.controlButton,
                backgroundColor: filters.size ? theme.accent : theme.control.bg,
                color: filters.size ? theme.onAccent : theme.control.text,
                border: `1px solid ${filters.size ? theme.accent : theme.control.border}`,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 5 H21 L14 13 V20 L10 18 V13 Z" fill="currentColor" />
              </svg>
              Filter{filters.size > 0 && ` (${filters.size})`}
            </button>
            {showFilters && (
              <FilterPopover
                filters={filters}
                onToggle={toggleFilter}
                onClear={() => {
                  setFilters(new Set());
                  setShowFilters(false);
                }}
                onClose={() => setShowFilters(false)}
                theme={theme}
              />
            )}
          </div>
          <button
            type="button"
            className="mobile-touch-target"
            onClick={() => setDescending((d) => !d)}
            title={descending ? 'Highest first, click for lowest first' : 'Lowest first, click for highest first'}
            aria-label={descending ? 'Showing highest first' : 'Showing lowest first'}
            style={{ ...styles.controlButton, width: '40px', padding: 0, backgroundColor: theme.control.bg, border: `1px solid ${theme.control.border}` }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: descending ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
              <path d="M12 4 L21 19 L3 19 Z" style={{ fill: theme.control.text }} />
            </svg>
          </button>
        </div>
      </div>

      {failed && (
        <LoadError
          title="Couldn't load the cards"
          message="Something went wrong on our end. Please try again in a moment."
          onRetry={() => {
            catalog.refetch();
            statsQuery.refetch();
          }}
          retrying={catalog.isFetching || statsQuery.isFetching}
        />
      )}

      {loading && <GridSkeleton isMobile={isMobile} />}

      {stats && cards.length > 0 && (
        <div style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : {}) }}>
          {cards.map(({ card, stat }, i) => {
            const rough = isLowSample(stat);
            return (
              <CardLink key={card.id} name={card.name}>
                <div style={{ opacity: rough ? 0.55 : 1 }} title={rough ? `Rarely played: only ${stat.games.toLocaleString('en-US')} games ${gamesPeriodOf(stats)}, too few for a reliable win rate.` : undefined}>
                  <CardTile
                    name={card.name}
                    iconUrl={cardIconUrl(card.iconUrls, mostPlayedVersion(stat))}
                    elixirCost={card.elixirCost}
                    nameColor={theme.text.primary}
                    nameSize={isMobile ? '11px' : '12px'}
                    lazyLoad={i >= EAGER_TILE_COUNT}
                  />
                  <TileStats theme={theme} stat={stat} />
                </div>
              </CardLink>
            );
          })}
        </div>
      )}

      {stats && catalog.data && cards.length === 0 && (
        <p style={{ ...styles.empty, color: theme.text.secondary }}>No cards match. Try another search or clear the filters.</p>
      )}
    </div>
  );
}

function gamesPeriodOf(stats: CardStatsResponse): string {
  if (stats.isLastPatch) return 'last patch';
  return stats.since ? 'this patch' : 'in the last 30 days';
}

function IntroSummary({ stats, isMobile }: { stats: CardStatsResponse | undefined; isMobile: boolean }) {
  if (stats && !isMobile) return <>{periodNote(stats)}</>;
  return <>{stats?.isLastPatch ? 'How every card did in Clan War last patch.' : 'How every card does in Clan War.'}</>;
}

function TileStats({ theme, stat }: { theme: Theme; stat: CardStat }) {
  return (
    <div style={styles.tileStats}>
      <span style={{ ...styles.winRate, color: theme.text.primary }}>{percent(stat.winRate)}</span>
      <span style={styles.changeLine}>
        <WinRateChange stat={stat} />
      </span>
      <span style={{ ...styles.playRate, color: theme.text.secondary }}>{percent(stat.playRate)} play</span>
    </div>
  );
}

function GridSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading cards">
      <div aria-hidden="true" style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : {}) }}>
        {Array.from({ length: isMobile ? MOBILE_SKELETON_TILES : DESKTOP_SKELETON_TILES }, (_, i) => (
          <div key={i}>
            <span className="skeleton" style={styles.skeletonArt} />
            <span className="skeleton" style={styles.skeletonLine} />
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
  },
  subtitle: {
    fontSize: '15px',
    margin: '8px 0 0',
    maxWidth: '760px',
  },
  controls: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
    marginBottom: '20px',
  },
  controlsMobile: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
    gap: '10px',
    marginBottom: '16px',
  },
  controlRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
  },
  search: {
    height: '35px',
    width: '180px',
    padding: '0 12px',
    boxSizing: 'border-box' as const,
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
  },
  filterWrap: {
    position: 'relative' as const,
  },
  controlButton: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '6px',
    height: '35px',
    padding: '0 14px',
    boxSizing: 'border-box' as const,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  grid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
    gap: '20px 14px',
  },
  gridMobile: {
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '16px 8px',
  },
  tileStats: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: '1px',
    marginTop: '4px',
    textAlign: 'center' as const,
  },
  winRate: {
    fontSize: '15px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    lineHeight: 1.2,
  },
  changeLine: {
    minHeight: '17px',
  },
  playRate: {
    fontSize: '11.5px',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  empty: {
    textAlign: 'center' as const,
    padding: '40px 0',
  },
  skeletonArt: {
    display: 'block' as const,
    aspectRatio: '0.82',
    borderRadius: '10px',
  },
  skeletonLine: {
    display: 'block' as const,
    height: '14px',
    margin: '8px 12px 0',
    borderRadius: '4px',
  },
};
