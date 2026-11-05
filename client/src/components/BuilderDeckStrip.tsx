import type { Theme } from '../theme';
import type { DeckBoard } from '../hooks/useDeckBoard';
import { availableVersions, type BuilderCard } from '../lib/builderCards';
import { cardIconUrl, displayLevel } from '../lib/cardDisplay';
import { slotKind, slotBorderStyle } from '../lib/slotStyles';
import { slotKey } from '../lib/deckBoard';
import CardTile from './CardTile';

interface BuilderDeckStripProps {
  deckIndex: number;
  name: string;
  board: DeckBoard;
  cardById: Map<number, BuilderCard>;
  target: number;
  onSlotClick: (slotIndex: number) => void;
  onSelectDeck: (deckIndex: number) => void;
  theme: Theme;
}

/** The deck being built, small enough to stay pinned on a phone while you pick from your cards below it. */
export default function BuilderDeckStrip({ deckIndex, name, board, cardById, target, onSlotClick, onSelectDeck, theme }: BuilderDeckStripProps) {
  const deck = board.decks[deckIndex] ?? [];
  const filled = deck.filter((id) => id != null).length;

  return (
    <div>
      <div style={styles.head}>
        <span style={styles.title}>
          <span style={{ ...styles.name, color: theme.text.primary }}>{name}</span>
          <span style={{ ...styles.count, color: theme.text.secondary }}>{filled} of 8 cards</span>
        </span>
        <span style={styles.chips}>
          {board.decks.map((_, i) => {
            const selected = i === deckIndex;
            return (
              <button
                key={i}
                type="button"
                className="mobile-touch-hitbox"
                aria-label={`Deck ${i + 1}`}
                aria-pressed={selected}
                onClick={() => onSelectDeck(i)}
                style={{
                  ...styles.chip,
                  borderColor: selected ? theme.accent : theme.border,
                  backgroundColor: selected ? 'color-mix(in srgb, var(--accent) 16%, var(--bg-secondary))' : theme.bg.secondary,
                  color: selected ? theme.text.primary : theme.text.secondary,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </span>
      </div>
      <div style={styles.slots}>
        {deck.map((cardId, slotIndex) => {
          const card = cardId != null ? cardById.get(cardId) ?? null : null;
          const kind = slotKind(slotIndex);
          const isTarget = slotIndex === target;
          if (!card) {
            return (
              <button
                key={slotIndex}
                type="button"
                data-strip-slot={slotIndex}
                onClick={() => onSlotClick(slotIndex)}
                aria-label={isTarget ? `Slot ${slotIndex + 1}, the next card you pick goes here` : `Fill slot ${slotIndex + 1} next`}
                style={styles.slot}
              >
                <div
                  className={isTarget ? 'wdb-target' : undefined}
                  style={{
                    ...styles.empty,
                    ...(kind ? slotBorderStyle(kind, `linear-gradient(${theme.bg.secondary}, ${theme.bg.secondary})`, false) : {}),
                  }}
                >
                  <span style={{ ...styles.plus, color: theme.text.secondary }}>+</span>
                </div>
              </button>
            );
          }
          const versions = availableVersions(card, kind);
          const override = board.slotVersion[slotKey(deckIndex, slotIndex)];
          const version = override && versions.includes(override) ? override : versions[0];
          const level = card.level != null ? displayLevel(card.level, card.maxLevel ?? 16) : null;
          return (
            <button
              key={slotIndex}
              type="button"
              data-strip-slot={slotIndex}
              onClick={() => onSlotClick(slotIndex)}
              aria-label={`Remove ${card.name}`}
              style={styles.slot}
            >
              <CardTile
                name={card.name}
                iconUrl={cardIconUrl(card.iconUrls, version ?? 'normal')}
                slotIndex={slotIndex}
                showName={false}
                artStyle={styles.art}
              >
                {level != null && <span style={styles.level}>{level}</span>}
              </CardTile>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  head: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '10px',
    marginBottom: '7px',
  },
  title: {
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    gap: '8px',
    minWidth: 0,
    whiteSpace: 'nowrap' as const,
  },
  name: {
    fontSize: '15px',
    fontWeight: 800 as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  count: {
    fontSize: '13px',
    fontWeight: 600 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  chips: {
    display: 'inline-flex' as const,
    gap: '6px',
    flexShrink: 0,
  },
  chip: {
    width: '32px',
    height: '26px',
    padding: 0,
    border: '1px solid',
    borderRadius: '8px',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 800 as const,
    cursor: 'pointer' as const,
  },
  slots: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    gap: '5px',
  },
  slot: {
    display: 'block' as const,
    width: '100%',
    minWidth: 0,
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer' as const,
  },
  art: {
    borderRadius: '7px',
  },
  empty: {
    aspectRatio: '0.82',
    border: '2px solid var(--empty-slot-border)',
    borderRadius: '7px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  plus: {
    fontSize: '17px',
    fontWeight: 300 as const,
  },
  level: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent)',
    color: 'white',
    fontSize: '10px',
    fontWeight: 700 as const,
    textAlign: 'center' as const,
    padding: '6px 0 1px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
  },
};
