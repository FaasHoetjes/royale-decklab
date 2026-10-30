import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { useShuffleAnimation } from '../hooks/useShuffleAnimation';
import type { BuilderCard } from '../lib/builderCards';
import { SORT_TYPES, matchesFilters, sortCards, ownedLevel, pickerIconUrl, type FilterKey, type SortType } from '../lib/pickerData';
import CardTile from './CardTile';
import PickerControls from './PickerControls';

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
  title?: string;
  subtitle?: string;
  /** Why a card in `usedIds` can't be picked, shown on hover. */
  usedLabel?: string;
  /** Multi-select mode: these cards show as picked, and clicking one again calls onSelect to un-pick it. */
  selectedIds?: Set<number>;
  selectedColor?: string;
  /** Badge on picked cards, drawn in `selectedColor` with this text colour. */
  selectedMark?: ReactNode;
  selectedMarkColor?: string;
  /** Grey out picked cards (for picks that remove a card rather than add it). */
  dimSelected?: boolean;
  /** Shown between the header and the cards, e.g. the current picks. */
  topContent?: ReactNode;
  /** Pinned under the cards, e.g. a "Done" button for multi-select. */
  footer?: ReactNode;
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
  title = 'Card Collection',
  subtitle,
  usedLabel = 'already in a deck',
  selectedIds,
  selectedColor,
  selectedMark = '✓',
  selectedMarkColor = '#ffffff',
  dimSelected = false,
  topContent,
  footer,
}: CardPickerProps) {
  const theme = getTheme();
  const isMobile = useIsMobile();
  const isPhone = useIsMobile(768);

  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sortType: SortType = SORT_TYPES[sortIndex]!;

  const ownedCount = useMemo(() => cards.filter((c) => c.owned).length, [cards]);
  const shuffleRef = useShuffleAnimation(`${sortType}-${descending}`);

  const visibleCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortCards(cards, sortType, descending).filter(
      (c) => (!q || c.name.toLowerCase().includes(q)) && matchesFilters(c, filters)
    );
  }, [cards, sortType, descending, query, filters]);

  const renderCard = (card: BuilderCard) => {
    const isUsed = usedIds.has(card.id);
    const isSelected = !!selectedIds?.has(card.id);
    const championBlocked = !allowChampions && card.rarity === 'champion';
    const selectable = card.owned && !isUsed && !championBlocked;
    const level = ownedLevel(card);

    return (
      <button
        key={card.id}
        ref={shuffleRef(card.id)}
        disabled={!selectable}
        onClick={() => selectable && onSelect(card.id)}
        title={
          !card.owned
            ? `${card.name} (not owned)`
            : isUsed
              ? `${card.name} (${usedLabel})`
              : championBlocked
                ? `${card.name} (no champion slot left in this deck)`
                : card.name
        }
        aria-pressed={selectedIds ? isSelected : undefined}
        style={{
          ...styles.cardButton,
          cursor: selectable ? 'pointer' : 'default',
          opacity: selectable ? 1 : 0.3,
          ...(isSelected ? { ...styles.selected, outlineColor: selectedColor ?? theme.accent } : {}),
        }}
      >
        <div style={isSelected && dimSelected ? styles.dimmed : undefined}>
          <CardTile
            name={card.name}
            iconUrl={pickerIconUrl(card, filters)}
            elixirCost={card.elixirCost}
            level={level >= 0 ? level : undefined}
            nameColor={theme.text.primary}
            lazyLoad
          />
        </div>
        {isSelected && (
          <span style={{ ...styles.selectedMark, backgroundColor: selectedColor ?? theme.accent, color: selectedMarkColor }} aria-hidden="true">
            {selectedMark}
          </span>
        )}
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
              <div style={{ ...styles.title, color: theme.text.primary }}>{title}</div>
              <div style={{ ...styles.foundText, color: subtitle ? theme.text.secondary : theme.accent }}>
                {subtitle ?? `Found: ${ownedCount}/${cards.length}`}
              </div>
            </div>
            {isMobile && closeButton}
          </div>

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
            trailing={!isMobile && closeButton}
          />
        </div>

        {topContent}
        <div style={{ ...styles.scrollViewport, padding: isMobile ? '12px' : '20px' }}>
          <div
            style={{
              ...styles.grid,
              gridTemplateColumns: isPhone
                ? 'repeat(4, minmax(0, 1fr))'
                : isMobile
                  ? 'repeat(auto-fill, minmax(110px, 1fr))'
                  : 'repeat(auto-fill, 110px)',
              gap: isPhone ? '8px' : '12px',
            }}
          >
            {visibleCards.map(renderCard)}
          </div>
        </div>
        {footer}
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
    fontWeight: 700 as const,
    lineHeight: 1.1,
  },
  foundText: {
    fontSize: '13px',
    fontWeight: 600 as const,
    marginTop: '2px',
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
    minWidth: 0,
    position: 'relative' as const,
    transition: 'transform 0.15s ease, opacity 0.15s ease',
  },
  selected: {
    outline: '3px solid',
    outlineOffset: '2px',
    borderRadius: '12px',
  },
  dimmed: {
    filter: 'grayscale(1) brightness(0.6)',
  },
  selectedMark: {
    position: 'absolute' as const,
    top: '-6px',
    right: '-6px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    fontSize: '13px',
    fontWeight: 800 as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.35)',
  },
};
