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
  iconUrls?: {
    medium?: string;
    evolutionMedium?: string;
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

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={{ ...styles.modal, backgroundColor: theme.bg.secondary, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...styles.header, borderBottomColor: theme.border }}>
          <div style={styles.titleBlock}>
            <div style={{ ...styles.title, color: theme.text.primary }}>Card Collection</div>
            <div style={styles.foundText}>
              Found: {ownedCount}/{cards.length}
            </div>
          </div>

          <div style={styles.controls}>
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

        <div style={styles.grid}>
          {sortedCards.map((card) => {
            const isUsed = usedIds.has(card.id);
            const selectable = card.owned && !isUsed;
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
                  opacity: selectable ? 1 : 0.35,
                  filter: selectable ? 'none' : 'grayscale(100%)',
                }}
              >
                <div style={styles.cardArt}>
                  {card.iconUrls?.medium && (
                    <img src={card.iconUrls.medium} alt={card.name} style={styles.cardImage} />
                  )}
                  {card.elixirCost != null && (
                    <div style={styles.cardElixir}>
                      <svg viewBox="0 0 28 30" style={styles.cardElixirDrop} aria-hidden="true">
                        <defs>
                          <radialGradient id="pickerElixirGrad" cx="36%" cy="62%" r="70%">
                            <stop offset="0%" stopColor="#f6a8ff" />
                            <stop offset="45%" stopColor="#d63bd6" />
                            <stop offset="100%" stopColor="#a0149e" />
                          </radialGradient>
                        </defs>
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
          })}
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
    maxHeight: '85vh',
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
    color: '#e056b0',
    fontSize: '13px',
    fontWeight: 700 as const,
    marginTop: '2px',
  },
  controls: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
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
  grid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
    gap: '12px',
    padding: '20px',
    overflowY: 'auto' as const,
  },
  cardButton: {
    background: 'none',
    border: 'none',
    padding: 0,
    display: 'block',
    width: '100%',
    transition: 'all 0.15s ease',
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
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
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
