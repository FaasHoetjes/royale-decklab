import { useMemo, useState } from 'react';
import { getTheme, type Theme } from '../theme';
import { useAllCards, useCardStats } from '../queries';
import type { CardStat, CardStatsResponse } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';
import { cardIconUrl } from '../lib/cardDisplay';
import { mostPlayedVersion } from '../lib/cardInfo';
import { CARD_SORTS, isLowSample, percent, sortCardStats, type CardSort } from '../lib/cardStats';
import { toBuilderCards } from '../lib/builderCards';
import { EXCLUSIVE_TYPES, matchesFilters, type FilterKey } from '../lib/pickerData';
import CardTile from '../components/CardTile';
import CardLink from '../components/CardLink';
import WinRateChange from '../components/WinRateChange';
import FilterPopover from '../components/FilterPopover';
import LoadError from '../components/LoadError';
import InfoTip from '../components/InfoTip';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const battlesIn = (stats: CardStatsResponse) => `${stats.battles.toLocaleString('en-US')} battles in the top 100 war clans`;
const patchSpan = (since: string | null, until: string) => (since ? `${shortDate(since)} to ${shortDate(until)}` : `up to ${shortDate(until)}`);

/** Which battles the numbers come from, in a sentence. */
export function periodNote(stats: CardStatsResponse): string {
  if (stats.isLastPatch && stats.until) {
    return `How every card did in Clan War last patch, from ${battlesIn(stats)} (${patchSpan(stats.since, stats.until)}). The new season's war battles aren't in yet.`;
  }
  return `How every card does in Clan War, from ${battlesIn(stats)} ${stats.since ? `since the ${shortDate(stats.since)} patch` : 'over the last 30 days'}.`;
}

/** Which battles the numbers come from, for the info tip in the page intro. */
function sourceNote(stats: CardStatsResponse): string {
  if (stats.isLastPatch && stats.until) {
    return `From ${battlesIn(stats)} last patch (${patchSpan(stats.since, stats.until)}). The new season's war battles aren't in yet.`;
  }
  return `From ${battlesIn(stats)} ${stats.since ? `since the ${shortDate(stats.since)} patch` : 'over the last 30 days'}.`;
}

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
  const gamesPeriod = stats?.isLastPatch ? 'last patch' : stats?.since ? 'this patch' : 'in the last 30 days';

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div style={{ marginBottom: isMobile ? '14px' : '20px' }}>
        <h1 className={isMobile ? 'visually-hidden' : undefined} style={{ color: theme.text.primary, margin: 0, fontSize: '1.5em' }}>Cards</h1>
        <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined, color: theme.text.secondary }}>
          {!stats ? (
            'How every card does in Clan War.'
          ) : isMobile ? (
            <>
              {stats.isLastPatch ? 'How every card did in Clan War last patch.' : 'How every card does in Clan War.'}
              <span style={styles.sourceTip}>
                <InfoTip ariaLabel="Which battles these numbers come from" color={theme.text.secondary} width={250} placement="bottom">
                  {sourceNote(stats)}
                </InfoTip>
              </span>
            </>
          ) : (
            periodNote(stats)
          )}
          <span style={{ display: 'block' }}>{isMobile ? 'Tap' : 'Click'} a card for its detailed stats.</span>
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
                <div style={{ opacity: rough ? 0.55 : 1 }} title={rough ? `Rarely played: only ${stat.games.toLocaleString('en-US')} games ${gamesPeriod}, too few for a reliable win rate.` : undefined}>
                  <CardTile
                    name={card.name}
                    iconUrl={cardIconUrl(card.iconUrls, mostPlayedVersion(stat))}
                    elixirCost={card.elixirCost}
                    nameColor={theme.text.primary}
                    nameSize={isMobile ? '11px' : '12px'}
                    lazyLoad={i > 24}
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

function SortSegment({ value, onPick, isMobile }: { value: CardSort; onPick: (sort: CardSort) => void; isMobile: boolean }) {
  const index = CARD_SORTS.indexOf(value);
  return (
    <div
      role="radiogroup"
      aria-label="Sort cards by"
      style={{ ...styles.segment, gridTemplateColumns: `repeat(${CARD_SORTS.length}, minmax(0, 1fr))`, ...(isMobile ? { width: '100%' } : {}) }}
    >
      <span
        aria-hidden="true"
        className="gc-thumb"
        style={{ ...styles.thumb, width: `calc((100% - 6px) / ${CARD_SORTS.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {CARD_SORTS.map((sort, i) => (
        <button
          key={sort}
          type="button"
          role="radio"
          aria-checked={i === index}
          onClick={() => onPick(sort)}
          style={{ ...styles.segmentButton, color: i === index ? 'var(--on-accent)' : 'var(--text-primary)' }}
        >
          {sort}
        </button>
      ))}
    </div>
  );
}

function GridSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading cards">
      <div aria-hidden="true" style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : {}) }}>
        {Array.from({ length: isMobile ? 16 : 30 }, (_, i) => (
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
    lineHeight: 1.5,
    margin: '8px 0 0',
    maxWidth: '760px',
  },
  sourceTip: {
    display: 'inline-flex' as const,
    verticalAlign: '-2px',
    marginLeft: '6px',
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
  segment: {
    position: 'relative' as const,
    display: 'grid' as const,
    width: '330px',
    padding: '3px',
    boxSizing: 'border-box' as const,
    borderRadius: '10px',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
  },
  thumb: {
    position: 'absolute' as const,
    top: '3px',
    bottom: '3px',
    left: '3px',
    borderRadius: '7px',
    backgroundColor: 'var(--accent)',
  },
  segmentButton: {
    position: 'relative' as const,
    height: '31px',
    border: 0,
    background: 'none',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    transition: 'color 0.2s ease',
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
