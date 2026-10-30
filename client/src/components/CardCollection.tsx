import { useMemo, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react';
import type { Theme } from '../theme';
import type { BuilderCard } from '../lib/builderCards';
import { SORT_TYPES, matchesFilters, ownedLevel, pickerIconUrl, sortCards, type FilterKey } from '../lib/pickerData';
import CardTile from './CardTile';
import PickerControls from './PickerControls';
import { useShuffleAnimation } from '../hooks/useShuffleAnimation';
import { useFold } from '../hooks/useFold';

interface CardCollectionProps {
  cards: BuilderCard[];
  /** Which deck each placed card is in. */
  usedIn: Map<number, number>;
  /** Whether the deck being built still has room for a champion. */
  championFits: boolean;
  onPick: (cardId: number, from: DOMRect) => void;
  filters: Set<FilterKey>;
  setFilters: Dispatch<SetStateAction<Set<FilterKey>>>;
  sortIndex: number;
  setSortIndex: Dispatch<SetStateAction<number>>;
  descending: boolean;
  setDescending: Dispatch<SetStateAction<boolean>>;
  /** A short message about the last pick, e.g. that the deck is full. */
  notice: string | null;
  /** The deck being built has no open slot, so the cards fold away unless the player opens them. */
  deckFull: boolean;
  open: boolean;
  onToggle: () => void;
  theme: Theme;
  isMobile: boolean;
}

/** The player's cards, always open under the deck: click one to drop it into the deck. */
export default function CardCollection({
  cards,
  usedIn,
  championFits,
  onPick,
  filters,
  setFilters,
  sortIndex,
  setSortIndex,
  descending,
  setDescending,
  notice,
  deckFull,
  open,
  onToggle,
  theme,
  isMobile,
}: CardCollectionProps) {
  const [query, setQuery] = useState('');
  const foldRef = useFold<HTMLDivElement>(open);
  const sortType = SORT_TYPES[sortIndex] ?? SORT_TYPES[0];

  const shuffleRef = useShuffleAnimation(`${sortType}-${descending}-${[...filters].join()}`);

  const owned = useMemo(() => cards.filter((c) => c.owned), [cards]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortCards(owned, sortType, descending).filter(
      (c) => (!q || c.name.toLowerCase().includes(q)) && matchesFilters(c, filters)
    );
  }, [owned, sortType, descending, query, filters]);

  const pick = (e: MouseEvent<HTMLButtonElement>, cardId: number) => {
    const art = e.currentTarget.querySelector('[data-art]')?.firstElementChild ?? e.currentTarget;
    onPick(cardId, art.getBoundingClientRect());
  };

  return (
    <section style={{ ...styles.section, borderTopColor: theme.border, paddingTop: isMobile ? '18px' : '24px' }}>
      <div style={styles.head}>
        <h3 style={{ ...styles.title, color: theme.text.primary }}>Your cards</h3>
        {deckFull ? (
          <button
            type="button"
            className="mobile-touch-target"
            onClick={onToggle}
            aria-expanded={open}
            style={{ ...styles.toggle, color: theme.text.primary }}
          >
            {open ? 'Hide cards' : 'Show cards'}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}
            >
              <path d="M5 9 L12 16 L19 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span aria-live="polite" style={{ ...styles.count, color: notice ? theme.text.primary : theme.text.tertiary, fontWeight: notice ? 600 : 400 }}>
            {notice ?? `${owned.length} owned`}
          </span>
        )}
      </div>
      {deckFull && (
        <p aria-live="polite" style={{ ...styles.hint, color: notice ? theme.text.primary : theme.text.secondary, fontWeight: notice ? 600 : 400 }}>
          {notice ?? 'This deck is complete. Click a card in it to swap it out.'}
        </p>
      )}

      <div ref={foldRef}>
        <div style={{ paddingTop: deckFull ? '16px' : 0, marginBottom: isMobile ? '16px' : '20px' }}>
          <PickerControls
            query={query}
            setQuery={setQuery}
            filters={filters}
            setFilters={setFilters}
            sortIndex={sortIndex}
            setSortIndex={setSortIndex}
            descending={descending}
            setDescending={setDescending}
            theme={theme}
            isMobile={isMobile}
            wideSearch
          />
        </div>

        <div
          style={{
            ...styles.grid,
            gridTemplateColumns: isMobile ? 'repeat(4, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(84px, 1fr))',
            gap: isMobile ? '10px 8px' : '14px 12px',
          }}
        >
          {visible.map((card) => {
            const deckIndex = usedIn.get(card.id);
            const noChampionSlot = card.rarity === 'champion' && !championFits;
            const disabled = deckIndex != null || noChampionSlot;
            const level = ownedLevel(card);
            return (
              <button
                key={card.id}
                ref={shuffleRef(card.id)}
                type="button"
                className="wdb-card"
                disabled={disabled}
                onClick={(e) => pick(e, card.id)}
                title={
                  deckIndex != null
                    ? `${card.name} is in Deck ${deckIndex + 1}`
                    : noChampionSlot
                      ? `${card.name}: no champion slot left in this deck`
                      : `Add ${card.name}`
                }
                style={{ ...styles.card, cursor: disabled ? 'default' : 'pointer' }}
              >
                {deckIndex != null && (
                  <span style={{ ...styles.badge, backgroundColor: theme.text.primary, color: theme.bg.primary }}>
                    Deck {deckIndex + 1}
                  </span>
                )}
                <div data-art style={{ opacity: disabled ? 0.3 : 1 }}>
                  <CardTile
                    name={card.name}
                    iconUrl={pickerIconUrl(card, filters)}
                    elixirCost={card.elixirCost}
                    level={level >= 0 ? level : undefined}
                    nameColor={theme.text.secondary}
                    lazyLoad
                  />
                </div>
              </button>
            );
          })}
          {visible.length === 0 && (
            <p style={{ ...styles.empty, color: theme.text.tertiary }}>No cards match.</p>
          )}
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    borderTop: '1px solid',
  },
  head: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: '12px',
    marginBottom: '14px',
  },
  title: {
    margin: 0,
    fontSize: '17px',
    fontWeight: 700 as const,
  },
  count: {
    fontSize: '13px',
    textAlign: 'right' as const,
  },
  toggle: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
  },
  hint: {
    margin: '-6px 0 0',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  grid: {
    display: 'grid' as const,
  },
  card: {
    position: 'relative' as const,
    minWidth: 0,
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    font: 'inherit',
    color: 'inherit',
  },
  badge: {
    position: 'absolute' as const,
    top: '4px',
    right: '4px',
    zIndex: 3,
    padding: '2px 6px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: 700 as const,
    whiteSpace: 'nowrap' as const,
  },
  empty: {
    gridColumn: '1 / -1',
    fontSize: '13px',
    margin: 0,
  },
};
