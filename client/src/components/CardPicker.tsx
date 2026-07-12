import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import type { BuilderCard } from '../lib/builderCards';
import { SORT_TYPES, EXCLUSIVE_TYPES, matchesFilters, sortCards, ownedLevel, pickerIconUrl, type FilterKey, type SortType } from '../lib/pickerData';
import CardTile from './CardTile';
import FilterPopover from './FilterPopover';

interface CardPickerProps {
  cards: BuilderCard[];
  usedIds: Set<number>;
  onSelect: (cardId: number) => void;
  onClose: () => void;
  filters: Set<FilterKey>;
  setFilters: Dispatch<SetStateAction<Set<FilterKey>>>;
  sortIndex: number;
  setSortIndex: Dispatch<SetStateAction<number>>;
  descending: boolean;
  setDescending: Dispatch<SetStateAction<boolean>>;
  allowChampions: boolean;
}

export default function CardPicker({
  cards,
  usedIds,
  onSelect,
  onClose,
  filters,
  setFilters,
  sortIndex,
  setSortIndex,
  descending,
  setDescending,
  allowChampions,
}: CardPickerProps) {
  const theme = getTheme();
  const isMobile = useIsMobile();

  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
  const sortType: SortType = SORT_TYPES[sortIndex]!;

  const ownedCount = useMemo(() => cards.filter((c) => c.owned).length, [cards]);
  const sortKey = `${sortType}-${descending}`;
  const cardRefs = useRef(new Map<number, HTMLButtonElement>());
  const prevRects = useRef(new Map<number, DOMRect>());

  useLayoutEffect(() => {
    const refs = cardRefs.current;

    const newRects = new Map<number, DOMRect>();
    refs.forEach((el, id) => newRects.set(id, el.getBoundingClientRect()));

    refs.forEach((el, id) => {
      const prev = prevRects.current.get(id);
      const next = newRects.get(id);
      if (!prev || !next) return;
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx || dy) {
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    });

    requestAnimationFrame(() => {
      refs.forEach((el) => {
        if (el.style.transform) {
          el.style.transition = 'transform 0.35s ease';
          el.style.transform = '';
        }
      });
    });

    prevRects.current = newRects;
  }, [sortKey]);

  const visibleCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortCards(cards, sortType, descending).filter(
      (c) => (!q || c.name.toLowerCase().includes(q)) && matchesFilters(c, filters)
    );
  }, [cards, sortType, descending, query, filters]);

  const renderCard = (card: BuilderCard) => {
    const isUsed = usedIds.has(card.id);
    const championBlocked = !allowChampions && card.rarity === 'champion';
    const selectable = card.owned && !isUsed && !championBlocked;
    const level = ownedLevel(card);

    return (
      <button
        key={card.id}
        ref={(el) => {
          if (el) cardRefs.current.set(card.id, el);
          else cardRefs.current.delete(card.id);
        }}
        disabled={!selectable}
        onClick={() => selectable && onSelect(card.id)}
        title={
          !card.owned
            ? `${card.name} (not owned)`
            : isUsed
              ? `${card.name} (already in a deck)`
              : championBlocked
                ? `${card.name} (no champion slot left in this deck)`
                : card.name
        }
        style={{
          ...styles.cardButton,
          cursor: selectable ? 'pointer' : 'default',
          opacity: selectable ? 1 : 0.3,
        }}
      >
        <CardTile
          name={card.name}
          iconUrl={pickerIconUrl(card, filters)}
          elixirCost={card.elixirCost}
          level={level >= 0 ? level : undefined}
          nameColor={theme.text.primary}
          lazyLoad
        />
      </button>
    );
  };

  const closeButton = (
    <button
      className="mobile-touch-target"
      onClick={onClose}
      style={{ ...styles.closeButton, color: theme.text.secondary }}
      aria-label="Close card picker"
    >
      ✕
    </button>
  );

  return (
    <div
      style={{ ...styles.overlay, padding: isMobile ? '10px' : '20px' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Card collection picker"
    >
      <div
        style={{
          ...styles.modal,
          height: isMobile ? '94dvh' : '85vh',
          backgroundColor: theme.bg.secondary,
          borderColor: theme.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            ...styles.header,
            ...(isMobile ? { flexDirection: 'column' as const, alignItems: 'stretch' as const, gap: '12px', padding: '14px' } : {}),
            borderBottomColor: theme.border,
          }}
        >
          <div style={styles.titleRow}>
            <div style={styles.titleBlock}>
              <div style={{ ...styles.title, color: theme.text.primary }}>Card Collection</div>
              <div style={{ ...styles.foundText, color: theme.accent }}>
                Found: {ownedCount}/{cards.length}
              </div>
            </div>
            {isMobile && closeButton}
          </div>

          <div style={{ ...styles.controls, ...(isMobile ? { gap: '8px' } : {}) }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards…"
              aria-label="Search cards by name"
              style={{
                ...styles.searchInput,
                ...(isMobile ? { flex: 1, width: 'auto', minWidth: 0 } : {}),
                backgroundColor: theme.control.bg,
                color: theme.control.text,
                border: `1px solid ${theme.control.border}`,
              }}
            />
            <div style={styles.filterWrap}>
              <button
                className="mobile-touch-target"
                onClick={() => setShowFilters((s) => !s)}
                style={{
                  ...styles.filterButton,
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
                />
              )}
            </div>
            <button
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
              className="mobile-touch-target"
              onClick={() => setSortIndex((i) => (i + 1) % SORT_TYPES.length)}
              style={{ ...styles.sortButton, ...(isMobile ? { padding: '0 12px' } : {}), backgroundColor: theme.control.bg, color: theme.control.text, border: `1px solid ${theme.control.border}` }}
              title="Click to change sort order"
            >
              By {sortType}
            </button>
            {!isMobile && closeButton}
          </div>
        </div>

        <div style={{ ...styles.scrollViewport, padding: isMobile ? '12px' : '20px' }}>
          <div
            style={{
              ...styles.grid,
              gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(auto-fill, 110px)',
              gap: isMobile ? '8px' : '12px',
            }}
          >
            {visibleCards.map(renderCard)}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 2000,
  },
  modal: {
    width: '100%',
    maxWidth: '900px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    border: '1px solid',
    borderRadius: '12px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
    overflow: 'hidden' as const,
  },
  header: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '16px 20px',
    borderBottom: '1px solid',
  },
  titleRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  titleBlock: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800 as const,
    lineHeight: 1.1,
  },
  foundText: {
    fontSize: '13px',
    fontWeight: 700 as const,
    marginTop: '2px',
  },
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
    gap: '6px',
    height: '35px',
    padding: '0 14px',
    boxSizing: 'border-box' as const,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 700 as const,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  filterCount: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minWidth: '16px',
    height: '16px',
    padding: '0 4px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 800 as const,
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
    fontWeight: 700 as const,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  closeButton: {
    border: 'none',
    background: 'transparent',
    fontSize: '20px',
    cursor: 'pointer',
    lineHeight: 1,
  },
  scrollViewport: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    scrollbarGutter: 'stable' as const,
    transform: 'translateZ(0)',
    willChange: 'transform' as const,
    contain: 'paint' as const,
  },
  grid: {
    display: 'grid' as const,
    justifyContent: 'center' as const,
  },
  cardButton: {
    background: 'none',
    border: 'none',
    padding: 0,
    display: 'block',
    width: '100%',
    transition: 'transform 0.15s ease, opacity 0.15s ease',
  },
};
