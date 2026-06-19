import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getTheme } from '../theme';

export interface BuilderCard {
  id: number;
  name: string;
  elixirCost?: number;
  rarity?: string;
  owned: boolean;
  level?: number;
  maxLevel?: number;
  // isHero: the card CAN be a hero (so it belongs in the Hero & Champion list).
  // hasEvo/ownsHero: the player actually OWNS that special tier (so we show the
  // special art instead of the regular icon).
  isHero?: boolean;
  hasEvo?: boolean;
  ownsHero?: boolean;
  iconUrls?: {
    medium?: string;
    evolutionMedium?: string;
    heroMedium?: string;
  };
}

// Sort modes, cycled by the sort button (Arena is excluded — we have no arena data).
const SORT_TYPES = ['Name', 'Level', 'Elixir', 'Rarity'] as const;
type SortType = (typeof SORT_TYPES)[number];

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  champion: 4,
};

// Card-type filters, mirroring the in-game filter panel (minus "Upgrade
// Available", which has no meaning here). Multiple can be active at once.
const FILTER_OPTIONS = [
  { key: 'evolution', label: 'Evolution' },
  { key: 'troop', label: 'Troop' },
  { key: 'spell', label: 'Spell' },
  { key: 'building', label: 'Building' },
  { key: 'champion', label: 'Hero & Champion' },
] as const;
type FilterKey = (typeof FILTER_OPTIONS)[number]['key'];

// A few cards fall outside the troop id range but are really troops.
const TROOP_OVERRIDES = new Set<number>([
  27000010, // Furnace
  28000016, // Heal Spirit
  28000025, // Spirit Empress
]);

// Card type derives from the official id ranges: 26xxxxxx troops, 27xxxxxx
// buildings, 28xxxxxx spells (see data/cardTags.ts), with the exceptions above.
function cardType(card: BuilderCard): 'troop' | 'building' | 'spell' | 'other' {
  if (TROOP_OVERRIDES.has(card.id)) return 'troop';
  if (card.id >= 28000000) return 'spell';
  if (card.id >= 27000000) return 'building';
  if (card.id >= 26000000) return 'troop';
  return 'other';
}

// Type buttons that can't co-exist — a card has exactly one of these types, so
// selecting one replaces any other already selected (see toggleFilter).
const EXCLUSIVE_TYPES: FilterKey[] = ['troop', 'spell', 'building'];

// Every active filter must apply (intersection) — so "Evolution + Building"
// means buildings that have an evolution. Evolution refines by must-have-evo;
// each type button asserts the card's type.
function matchesFilters(card: BuilderCard, active: Set<FilterKey>): boolean {
  if (active.size === 0) return true;
  if (active.has('evolution') && !card.iconUrls?.evolutionMedium) return false;

  const isChampion = card.rarity === 'champion';
  const typeChecks: Array<[FilterKey, boolean]> = [
    // Heroes are troop variants, so they still count as troops; champions are
    // their own rarity and live only under "Hero & Champion".
    ['troop', cardType(card) === 'troop' && !isChampion],
    ['spell', cardType(card) === 'spell'],
    ['building', cardType(card) === 'building'],
    ['champion', isChampion || !!card.isHero],
  ];
  return typeChecks.every(([key, matches]) => !active.has(key) || matches);
}

// Normalize a card's level to the unified /16 king-level scale.
// Mirrors getDisplayLevel in DeckCard.tsx (War Deck Generator).
function getDisplayLevel(level: number, maxLevel: number): number {
  const offset = 16 - maxLevel;
  return level + offset;
}

interface CardPickerProps {
  cards: BuilderCard[];
  usedIds: Set<number>;
  onSelect: (cardId: number) => void;
  onClose: () => void;
  isDarkMode: boolean;
}

export default function CardPicker({
  cards,
  usedIds,
  onSelect,
  onClose,
  isDarkMode,
}: CardPickerProps) {
  const theme = getTheme(isDarkMode);

  const [sortIndex, setSortIndex] = useState(0);
  const [descending, setDescending] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const toggleFilter = (key: FilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Turning on a type filter clears the other mutually-exclusive types.
        if (EXCLUSIVE_TYPES.includes(key)) EXCLUSIVE_TYPES.forEach((k) => next.delete(k));
        next.add(key);
      }
      return next;
    });
  const clearFilters = () => setFilters(new Set());
  const sortType: SortType = SORT_TYPES[sortIndex]!;
  const cycleSort = () => setSortIndex((i) => (i + 1) % SORT_TYPES.length);
  const toggleDirection = () => setDescending((d) => !d);

  const ownedCount = useMemo(() => cards.filter((c) => c.owned).length, [cards]);

  // FLIP animation: cards slide from their old positions to their new ones on every re-sort.
  const sortKey = `${sortType}-${descending}`;
  const cardRefs = useRef(new Map<number, HTMLButtonElement>());
  const prevRects = useRef(new Map<number, DOMRect>());

  useLayoutEffect(() => {
    const refs = cardRefs.current;

    // Read all new positions first (batched) to avoid layout thrashing.
    const newRects = new Map<number, DOMRect>();
    refs.forEach((el, id) => newRects.set(id, el.getBoundingClientRect()));

    // Invert: offset each moved card back to where it was, with no transition.
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

    // Play: on the next frame, release the offset so cards glide to their new spots.
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

  const sortedCards = useMemo(() => {
    const dir = descending ? -1 : 1;
    const byName = (a: BuilderCard, b: BuilderCard) => a.name.localeCompare(b.name);
    const levelOf = (c: BuilderCard) =>
      c.owned && c.level != null && c.maxLevel != null
        ? getDisplayLevel(c.level, c.maxLevel)
        : -1;

    const copy = [...cards];
    copy.sort((a, b) => {
      let cmp: number;
      switch (sortType) {
        case 'Level': {
          // Owned cards always come before unowned, regardless of direction.
          const aOwned = a.owned && a.level != null && a.maxLevel != null;
          const bOwned = b.owned && b.level != null && b.maxLevel != null;
          if (aOwned !== bOwned) return aOwned ? -1 : 1;
          cmp = levelOf(a) - levelOf(b);
          break;
        }
        case 'Elixir':
          cmp = (a.elixirCost ?? Infinity) - (b.elixirCost ?? Infinity);
          break;
        case 'Rarity':
          cmp = (RARITY_ORDER[a.rarity ?? ''] ?? 99) - (RARITY_ORDER[b.rarity ?? ''] ?? 99);
          break;
        case 'Name':
        default:
          cmp = byName(a, b);
          break;
      }
      if (cmp === 0) cmp = byName(a, b);
      return cmp * dir;
    });
    return copy;
  }, [cards, sortType, descending]);

  const visibleCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedCards.filter(
      (c) =>
        (!q || c.name.toLowerCase().includes(q)) && matchesFilters(c, filters)
    );
  }, [sortedCards, query, filters]);

  // When the ONLY active filter is "Hero & Champion", split the grid into a
  // Heroes section followed by a Champions section (each preserving sort order).
  // With other filters mixed in, the section headers wouldn't make sense.
  const sectioned = filters.size === 1 && filters.has('champion');
  const heroCards = sectioned ? visibleCards.filter((c) => c.isHero) : [];
  const championCards = sectioned
    ? visibleCards.filter((c) => c.rarity === 'champion' && !c.isHero)
    : [];

  const renderCard = (card: BuilderCard) => {
    const isUsed = usedIds.has(card.id);
    const selectable = card.owned && !isUsed;

    // With the Evolution filter on, show the evo art for cards whose evo the
    // player owns; with Hero & Champion on, show the hero art for hero cards
    // they own (falling back to the evo art when no dedicated hero icon exists).
    // When both filters are on, prefer the hero art — but only for heroes the
    // player actually owns, so evo-only owners still see their evo card.
    let iconUrl = card.iconUrls?.medium;
    if (filters.has('champion') && card.ownsHero) {
      iconUrl = card.iconUrls?.heroMedium ?? card.iconUrls?.evolutionMedium ?? iconUrl;
    } else if (filters.has('evolution') && card.hasEvo && card.iconUrls?.evolutionMedium) {
      iconUrl = card.iconUrls.evolutionMedium;
    }

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
              : card.name
        }
        style={{
          ...styles.cardButton,
          cursor: selectable ? 'pointer' : 'default',
          opacity: selectable ? 1 : 0.3,
        }}
      >
        <div style={styles.cardArt}>
          {iconUrl && (
            <img
              src={iconUrl}
              alt={card.name}
              loading="lazy"
              decoding="async"
              style={styles.cardImage}
            />
          )}
          {card.elixirCost != null && (
            <div style={styles.cardElixir}>
              <svg viewBox="0 0 28 30" style={styles.cardElixirDrop} aria-hidden="true">
                <path
                  d="M24 5 Q24 18 22.8 24.9 A12 12 0 0 1 1.7 13.9 Q6 6 24 5 Z"
                  fill="url(#pickerElixirGrad)"
                  stroke="#000000"
                  strokeWidth="1.6"
                />
                <ellipse cx="9" cy="14" rx="2.4" ry="3.4" fill="rgba(255,255,255,0.55)" transform="rotate(-20 9 14)" />
              </svg>
              <span style={styles.cardElixirText}>{card.elixirCost}</span>
            </div>
          )}
          {card.owned && card.level != null && card.maxLevel != null && (
            <div style={styles.cardLevel}>LEVEL {getDisplayLevel(card.level, card.maxLevel)}</div>
          )}
        </div>
        <div style={{ ...styles.cardName, color: theme.text.primary }}>{card.name}</div>
      </button>
    );
  };

  const sectionHeader = (label: string, topGap: boolean) => (
    <div style={{ ...styles.sectionHeader, marginTop: topGap ? '10px' : 0 }}>
      <span style={{ ...styles.sectionLabel, color: theme.text.secondary }}>{label}</span>
      <span style={{ ...styles.sectionRule, backgroundColor: theme.border }} />
    </div>
  );

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={{ ...styles.modal, backgroundColor: theme.bg.secondary, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...styles.header, borderBottomColor: theme.border }}>
          <div style={styles.titleBlock}>
            <div style={{ ...styles.title, color: theme.text.primary }}>Card Collection</div>
            <div style={{ ...styles.foundText, color: theme.accent }}>
              Found: {ownedCount}/{cards.length}
            </div>
          </div>

          <div style={styles.controls}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards…"
              aria-label="Search cards by name"
              style={{
                ...styles.searchInput,
                backgroundColor: theme.control.bg,
                color: theme.control.text,
                border: `1px solid ${theme.control.border}`,
              }}
            />
            <div style={styles.filterWrap}>
              <button
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
                <>
                  <div style={styles.filterBackdrop} onClick={() => setShowFilters(false)} />
                  <div
                    style={{
                      ...styles.filterPopover,
                      backgroundColor: theme.bg.secondary,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    {FILTER_OPTIONS.map((opt) => {
                      const on = filters.has(opt.key);
                      return (
                        <button
                          key={opt.key}
                          onClick={() => toggleFilter(opt.key)}
                          className="picker-filter-option"
                          style={{ ...styles.filterOption, color: theme.text.primary }}
                          role="menuitemcheckbox"
                          aria-checked={on}
                        >
                          <span
                            style={{
                              ...styles.filterCheck,
                              backgroundColor: on ? theme.accent : 'transparent',
                              border: `2px solid ${on ? theme.accent : theme.borderStrong}`,
                              color: theme.onAccent,
                            }}
                          >
                            {on && (
                              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 13 L10 18 L19 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          {opt.label}
                        </button>
                      );
                    })}
                    <button
                      onClick={clearFilters}
                      disabled={filters.size === 0}
                      style={{
                        ...styles.filterClear,
                        borderTop: `1px solid ${theme.border}`,
                        color: filters.size ? theme.accent : theme.text.tertiary,
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={toggleDirection}
              style={{ ...styles.arrowButton, backgroundColor: theme.control.bg, border: `1px solid ${theme.control.border}` }}
              title={descending ? 'Descending — click for ascending' : 'Ascending — click for descending'}
              aria-label="Toggle sort direction"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                style={{ transform: descending ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
              >
                <path d="M12 4 L21 19 L3 19 Z" fill={theme.control.text} />
              </svg>
            </button>
            <button
              onClick={cycleSort}
              style={{ ...styles.sortButton, backgroundColor: theme.control.bg, color: theme.control.text, border: `1px solid ${theme.control.border}` }}
              title="Click to change sort order"
            >
              By {sortType}
            </button>
            <button
              onClick={onClose}
              style={{ ...styles.closeButton, color: theme.text.secondary }}
              aria-label="Close card picker"
            >
              ✕
            </button>
          </div>
        </div>

        {/* One shared elixir-drop gradient for every card (avoids 121 duplicate
            <defs>/IDs, which bloats the DOM and re-paints needlessly). */}
        <svg width="0" height="0" style={styles.svgDefs} aria-hidden="true">
          <defs>
            <radialGradient id="pickerElixirGrad" cx="36%" cy="62%" r="70%">
              <stop offset="0%" stopColor="#f6a8ff" />
              <stop offset="45%" stopColor="#d63bd6" />
              <stop offset="100%" stopColor="#a0149e" />
            </radialGradient>
          </defs>
        </svg>

        <div style={styles.scrollViewport}>
          <div style={styles.grid}>
            {sectioned ? (
              <>
                {heroCards.length > 0 && sectionHeader('Heroes', false)}
                {heroCards.map(renderCard)}
                {championCards.length > 0 &&
                  sectionHeader('Champions', heroCards.length > 0)}
                {championCards.map(renderCard)}
              </>
            ) : (
              visibleCards.map(renderCard)
            )}
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
    padding: '20px',
  },
  modal: {
    width: '100%',
    maxWidth: '900px',
    // Fixed height (not max-height) so the window stays the same size whether the
    // full collection or a few search results are showing — the grid just fills
    // less of the scroll area instead of the whole modal shrinking.
    height: '85vh',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
    overflow: 'hidden' as const,
  },
  header: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '16px 20px',
    borderBottom: '1px solid #e0e0e0',
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
  // A transparent layer that catches the next click anywhere else and closes
  // the popover (outside-click), without dismissing the whole modal.
  filterBackdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 10,
  },
  filterPopover: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    zIndex: 11,
    minWidth: '200px',
    borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
    padding: '6px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  filterOption: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    width: '100%',
    padding: '9px 10px',
    background: 'none',
    border: 'none',
    borderRadius: '7px',
    fontSize: '14px',
    fontWeight: 600 as const,
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  filterCheck: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '20px',
    height: '20px',
    flexShrink: 0,
    borderRadius: '6px',
  },
  filterClear: {
    marginTop: '4px',
    padding: '10px',
    background: 'none',
    border: 'none',
    borderRadius: 0,
    fontSize: '13px',
    fontWeight: 700 as const,
    cursor: 'pointer',
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
    color: '#ffffff',
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
  svgDefs: {
    position: 'absolute' as const,
    width: 0,
    height: 0,
    pointerEvents: 'none' as const,
  },
  scrollViewport: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    // Always reserve the scrollbar gutter. Otherwise, filtering down to a few
    // results removes the scrollbar, widens the viewport, fits an extra grid
    // column, and shrinks every card — a visible jump while typing.
    scrollbarGutter: 'stable' as const,
    padding: '20px',
    // The modal's rounded `overflow: hidden` clip would otherwise force this
    // scroller onto the main thread (repainting every frame). Promote it to its
    // own GPU layer so scrolling is a compositor translate — the same path that
    // makes the FLIP transform animation buttery.
    transform: 'translateZ(0)',
    willChange: 'transform' as const,
    contain: 'paint' as const,
  },
  grid: {
    display: 'grid' as const,
    // Fixed-width tracks (no 1fr) so every card is exactly the same size whether
    // the full collection or a single search result is showing — the tracks
    // never stretch to fill the row. Centered so the leftover gutter is even.
    gridTemplateColumns: 'repeat(auto-fill, 110px)',
    justifyContent: 'center' as const,
    gap: '12px',
  },
  // Full-width section header that forces the next card onto a fresh row by
  // spanning every grid column.
  sectionHeader: {
    gridColumn: '1 / -1',
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 800 as const,
    letterSpacing: '0.6px',
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  },
  sectionRule: {
    flex: 1,
    height: '1px',
  },
  cardButton: {
    background: 'none',
    border: 'none',
    padding: 0,
    display: 'block',
    width: '100%',
    transition: 'transform 0.15s ease, opacity 0.15s ease',
  },
  cardArt: {
    position: 'relative' as const,
    aspectRatio: '0.82',
    borderRadius: '10px',
    overflow: 'hidden' as const,
    border: '2px solid rgba(0, 0, 0, 0.15)',
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.25)',
    background: 'linear-gradient(160deg, #2a3a6a 0%, #16213f 100%)',
  },
  cardImage: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  cardElixir: {
    position: 'absolute' as const,
    top: '3px',
    left: '3px',
    width: '23px',
    height: '25px',
  },
  cardElixirDrop: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
  },
  cardElixirText: {
    position: 'absolute' as const,
    left: 0,
    right: '8%',
    top: '60%',
    transform: 'translateY(-50%)',
    textAlign: 'center' as const,
    color: 'white',
    fontWeight: 'bold' as const,
    fontSize: '11px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
  },
  cardLevel: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent)',
    color: 'white',
    fontSize: '11px',
    fontWeight: 800 as const,
    letterSpacing: '0.5px',
    textAlign: 'center' as const,
    padding: '12px 0 4px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
  },
  cardName: {
    fontSize: '11px',
    fontWeight: 600 as const,
    textAlign: 'center' as const,
    marginTop: '5px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
};
