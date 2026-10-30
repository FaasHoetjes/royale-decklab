import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Theme } from '../theme';
import { SORT_TYPES, EXCLUSIVE_TYPES, type FilterKey } from '../lib/pickerData';
import FilterPopover from './FilterPopover';

interface PickerControlsProps {
  query: string;
  setQuery: (query: string) => void;
  filters: Set<FilterKey>;
  setFilters: Dispatch<SetStateAction<Set<FilterKey>>>;
  sortIndex: number;
  setSortIndex: Dispatch<SetStateAction<number>>;
  descending: boolean;
  setDescending: Dispatch<SetStateAction<boolean>>;
  theme: Theme;
  isMobile: boolean;
  /** Lets the search box take the free width instead of a fixed one. */
  wideSearch?: boolean;
  /** Shown after the sort button, e.g. a close button. */
  trailing?: ReactNode;
}

/** Search, filter, sort direction and sort order for a grid of cards. */
export default function PickerControls({
  query,
  setQuery,
  filters,
  setFilters,
  sortIndex,
  setSortIndex,
  descending,
  setDescending,
  theme,
  isMobile,
  wideSearch = false,
  trailing,
}: PickerControlsProps) {
  const [showFilters, setShowFilters] = useState(false);
  const sortType = SORT_TYPES[sortIndex] ?? SORT_TYPES[0];

  const toggleFilter = (key: FilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (EXCLUSIVE_TYPES.includes(key)) EXCLUSIVE_TYPES.forEach((k) => next.delete(k));
        next.add(key);
      }
      return next;
    });
  const clearFilters = () => {
    setFilters(new Set());
    setShowFilters(false);
  };

  return (
    <div style={{ ...styles.controls, ...(isMobile ? { gap: '8px', flexWrap: 'wrap' as const } : {}) }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search cards…"
        aria-label="Search cards by name"
        style={{
          ...styles.searchInput,
          ...(wideSearch && { flex: 1, width: 'auto', minWidth: 0 }),
          ...(isMobile ? { flex: '1 1 100%', width: 'auto', minWidth: 0 } : {}),
          backgroundColor: theme.control.bg,
          color: theme.control.text,
          border: `1px solid ${theme.control.border}`,
        }}
      />
      <div style={{ ...styles.filterWrap, ...(isMobile ? { flex: 1 } : {}) }}>
        <button
          type="button"
          className="mobile-touch-target"
          onClick={() => setShowFilters((s) => !s)}
          style={{
            ...styles.filterButton,
            ...(filters.size ? {} : { padding: '0 29px' }),
            ...(isMobile ? { width: '100%' } : {}),
            backgroundColor: filters.size ? theme.accent : theme.control.bg,
            color: filters.size ? theme.onAccent : theme.control.text,
            border: `1px solid ${filters.size ? theme.accent : theme.control.border}`,
          }}
          title="Filter cards by type"
          aria-label="Filter cards by type"
          aria-expanded={showFilters}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 5 H21 L14 13 V20 L10 18 V13 Z" fill="currentColor" />
          </svg>
          Filter
          {filters.size > 0 && <span style={styles.filterCount}>{filters.size}</span>}
        </button>
        {showFilters && (
          <FilterPopover
            filters={filters}
            onToggle={toggleFilter}
            onClear={clearFilters}
            onClose={() => setShowFilters(false)}
            theme={theme}
            align={isMobile ? 'left' : 'right'}
          />
        )}
      </div>
      <button
        type="button"
        className="mobile-touch-target"
        onClick={() => setDescending((d) => !d)}
        style={{ ...styles.arrowButton, backgroundColor: theme.control.bg, border: `1px solid ${theme.control.border}` }}
        title={descending ? 'Descending, click for ascending' : 'Ascending, click for descending'}
        aria-label="Toggle sort direction"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          style={{ transform: descending ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
        >
          <path d="M12 4 L21 19 L3 19 Z" style={{ fill: theme.control.text }} />
        </svg>
      </button>
      <button
        type="button"
        className="mobile-touch-target"
        onClick={() => setSortIndex((i) => (i + 1) % SORT_TYPES.length)}
        style={{ ...styles.sortButton, ...(isMobile ? { padding: '0 12px', flex: 1 } : {}), backgroundColor: theme.control.bg, color: theme.control.text, border: `1px solid ${theme.control.border}` }}
        title="Click to change sort order"
      >
        <span style={styles.sortLabels}>
          {SORT_TYPES.map((type) => (
            <span key={type} style={{ ...styles.sortLabel, visibility: type === sortType ? 'visible' : 'hidden' }} aria-hidden={type !== sortType}>
              By {type}
            </span>
          ))}
        </span>
      </button>
      {trailing}
    </div>
  );
}

const styles = {
  controls: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
  },
  searchInput: {
    height: '35px',
    width: '160px',
    padding: '0 12px',
    boxSizing: 'border-box' as const,
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
  },
  filterWrap: {
    position: 'relative' as const,
  },
  filterButton: {
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
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  },
  filterCount: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '24px',
    height: '16px',
    boxSizing: 'border-box' as const,
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 700 as const,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  arrowButton: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '40px',
    height: '35px',
    boxSizing: 'border-box' as const,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  sortButton: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: '35px',
    padding: '0 18px',
    boxSizing: 'border-box' as const,
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  sortLabels: {
    display: 'grid' as const,
  },
  sortLabel: {
    gridArea: '1 / 1',
    textAlign: 'center' as const,
  },
};
