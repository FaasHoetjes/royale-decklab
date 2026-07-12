import type { Theme } from '../theme';
import type { BuilderCard } from '../lib/builderCards';
import type { BuilderDeckScore } from '../api';
import { avgElixir } from '../lib/cardDisplay';
import { SLOTS_PER_DECK, slotKey } from '../lib/deckBoard';
import { buildDeckLink, isCompleteDeck } from '../lib/deckLink';
import type { DeckBoard } from '../hooks/useDeckBoard';
import DeckSlot from './DeckSlot';
import { ElixirDropIcon } from './ElixirBadge';
import TrashIcon from './TrashIcon';

interface DeckPanelProps {
  deckIndex: number;
  board: DeckBoard;
  cardById: Map<number, BuilderCard>;
  score?: BuilderDeckScore;
  scoreAccent: string;
  theme: Theme;
  isMobile: boolean;
  onOpenPicker: (slotIndex: number) => void;
}

export default function DeckPanel({
  deckIndex,
  board,
  cardById,
  score,
  scoreAccent,
  theme,
  isMobile,
  onOpenPicker,
}: DeckPanelProps) {
  const deck = board.decks[deckIndex] ?? [];
  const placedCards = deck.flatMap((id) => {
    const card = id != null ? cardById.get(id) : null;
    return card ? [card] : [];
  });

  const handleSlotClick = (slotIndex: number) => {
    if (board.consumeDragClick()) return;
    if (deck[slotIndex] != null) {
      board.setSlot(deckIndex, slotIndex, null);
    } else {
      onOpenPicker(slotIndex);
    }
  };

  return (
    <div
      style={{
        ...styles.deck,
        padding: isMobile ? '14px 12px' : '20px',
        backgroundColor: theme.bg.secondary,
        borderColor: theme.border,
      }}
    >
      <div style={{ ...styles.header, gap: isMobile ? '8px' : '14px' }}>
        <h3 style={{ ...styles.title, color: theme.text.primary }}>Deck {deckIndex + 1}</h3>
        <div style={{ ...styles.headerStats, gap: isMobile ? '10px' : '14px' }}>
          {isCompleteDeck(deck) && (
            <a
              href={buildDeckLink(deck)}
              target="_blank"
              rel="noopener noreferrer"
              className="mobile-touch-target"
              aria-label={`Open Deck ${deckIndex + 1} in Clash Royale`}
              title="Open this deck in Clash Royale"
              style={{ ...styles.openInGameBtn, color: scoreAccent, borderColor: theme.border }}
            >
              <svg viewBox="0 0 24 24" style={styles.openInGameIcon} aria-hidden="true">
                <path fill="currentColor" d="M8 5v14l11-7z" />
              </svg>
            </a>
          )}
          {placedCards.length > 0 && (
            <button
              className="mobile-touch-target"
              onClick={() => board.resetDeck(deckIndex)}
              aria-label={`Clear Deck ${deckIndex + 1}`}
              title={`Clear Deck ${deckIndex + 1}`}
              style={{ ...styles.resetBtn, color: scoreAccent, borderColor: theme.border }}
            >
              <TrashIcon size={13} />
            </button>
          )}
          {placedCards.length > 0 && (
            <span style={{ ...styles.avgElixir, color: theme.text.secondary }}>
              <ElixirDropIcon />
              Avg {avgElixir(placedCards).toFixed(1)}
            </span>
          )}
          <DeckScore
            score={score}
            filled={placedCards.length}
            scoreAccent={scoreAccent}
            mutedColor={theme.text.secondary}
          />
        </div>
      </div>

      <div
        style={{
          ...styles.slotGrid,
          gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(8, 1fr)',
          gap: isMobile ? '8px' : '10px',
        }}
      >
        {deck.map((cardId, slotIndex) => {
          const slot = { deckIndex, slotIndex };
          const isDropTarget =
            board.dragOver?.deckIndex === deckIndex && board.dragOver?.slotIndex === slotIndex;
          return (
            <DeckSlot
              key={slotIndex}
              card={cardId != null ? cardById.get(cardId) ?? null : null}
              deckIndex={deckIndex}
              slotIndex={slotIndex}
              theme={theme}
              versionOverride={board.slotVersion[slotKey(deckIndex, slotIndex)]}
              isDragging={
                board.dragSource?.deckIndex === deckIndex && board.dragSource?.slotIndex === slotIndex
              }
              isDropTarget={isDropTarget}
              isInvalidDropTarget={
                isDropTarget && board.dragSource != null && board.isChampionViolation(board.dragSource, slot)
              }
              onClick={() => handleSlotClick(slotIndex)}
              onToggleVersion={(versions) => board.toggleVersion(deckIndex, slotIndex, versions)}
              onDragStart={(e) => board.handleDragStart(e, slot)}
              onDragOver={(e) => board.handleDragOver(e, slot)}
              onDrop={(e) => board.handleDrop(e, slot)}
              onDragEnd={board.handleDragEnd}
              onPointerDown={(e) => board.handlePointerDown(e, slot)}
              onPointerMove={board.handlePointerMove}
              onPointerUp={board.handlePointerUp}
              onPointerCancel={board.handlePointerCancel}
              onContextMenu={board.handleContextMenu}
            />
          );
        })}
      </div>
    </div>
  );
}

// A meta-matched deck (★, accent) is scored exactly like the auto-generated
// recommendations; any other deck (~, muted) is an unproven estimate using a
// neutral 50% prior, dampened below proven decks.
function DeckScore({
  score,
  filled,
  scoreAccent,
  mutedColor,
}: {
  score?: BuilderDeckScore;
  filled: number;
  scoreAccent: string;
  mutedColor: string;
}) {
  if (!score || score.score == null) return null;
  const winPct = ((score.winRate ?? 0) * 100).toFixed(1);
  const fieldPct = ((score.fieldability ?? 0) * 100).toFixed(0);

  if (score.isMeta) {
    return (
      <span
        style={{ ...styles.score, color: scoreAccent }}
        title={`Meta deck: same score as the auto-generated decks. ${winPct}% win rate × ${fieldPct}% fieldability × how widely it's played (${score.players} player${score.players === 1 ? '' : 's'}).`}
      >
        ★ {score.score.toFixed(3)}
      </span>
    );
  }
  return (
    <span
      style={{ ...styles.score, color: mutedColor }}
      title={
        `Estimated${filled < SLOTS_PER_DECK ? ` (${filled}/${SLOTS_PER_DECK} cards)` : ''}: not a known meta deck. Assumes a 50% win rate ` +
        `× ${fieldPct}% fieldability (how close to maxed you can field it), then dampened for being unproven (no one on record runs it) so it ranks below any proven meta deck. Build a known meta deck to score higher.`
      }
    >
      ~ {score.score.toFixed(3)}
    </span>
  );
}

const styles = {
  deck: {
    border: '1px solid',
    borderRadius: '12px',
  },
  header: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexWrap: 'wrap' as const,
    marginBottom: '16px',
    minHeight: '26px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
  },
  headerStats: {
    display: 'flex' as const,
    alignItems: 'center' as const,
  },
  openInGameBtn: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'none',
    border: '1px solid',
    borderRadius: '50%',
    width: '26px',
    height: '26px',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'none',
  },
  openInGameIcon: {
    width: '13px',
    height: '13px',
    display: 'block' as const,
  },
  resetBtn: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'none',
    border: '1px solid',
    borderRadius: '50%',
    width: '26px',
    height: '26px',
    padding: 0,
    cursor: 'pointer',
  },
  avgElixir: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    fontSize: '13px',
    fontWeight: 700 as const,
  },
  score: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '3px',
    fontSize: '13px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    cursor: 'help' as const,
  },
  slotGrid: {
    display: 'grid' as const,
  },
};
