import { forwardRef, type Ref } from 'react';
import { Link } from 'react-router-dom';
import type { BuilderDeckScore } from '../api';
import type { Theme } from '../theme';
import type { DeckBoard } from '../hooks/useDeckBoard';
import { useTween } from '../hooks/useTween';
import type { BuilderCard } from '../lib/builderCards';
import { avgElixir } from '../lib/cardDisplay';
import { SLOTS_PER_DECK, slotKey } from '../lib/deckBoard';
import { buildDeckLink } from '../lib/deckLink';
import { cycleCost, deckCards, elixirCurve } from '../lib/builderDecks';
import DeckSlot from './DeckSlot';
import DeckLinkAction from './DeckLinkAction';
import TrashIcon from './TrashIcon';

interface BuilderStageProps {
  deckIndex: number;
  name: string;
  score?: BuilderDeckScore;
  board: DeckBoard;
  cardById: Map<number, BuilderCard>;
  target: number;
  onSlotClick: (slotIndex: number) => void;
  slotsRef?: Ref<HTMLDivElement>;
  theme: Theme;
  isMobile: boolean;
}

const CURVE_LABELS = ['1', '2', '3', '4', '5', '6+'];

const BuilderStage = forwardRef<HTMLDivElement, BuilderStageProps>(function BuilderStage(
  { deckIndex, name, score, board, cardById, target, onSlotClick, slotsRef, theme, isMobile },
  ref
) {
  const deck = board.decks[deckIndex] ?? [];
  const cards = deckCards(deck, cardById);
  const complete = cards.length === SLOTS_PER_DECK;
  const curve = elixirCurve(cards);
  const curveMax = Math.max(3, ...curve);
  const cycle = cycleCost(cards);

  return (
    <div
      ref={ref}
      style={{
        ...styles.stage,
        gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 250px',
        gap: isMobile ? '18px' : '36px',
        margin: isMobile ? '14px 0 26px' : '30px 0 40px',
      }}
    >
      <div>
        <h3 style={{ ...styles.name, fontSize: isMobile ? '19px' : '24px', marginBottom: isMobile ? '12px' : '18px', color: theme.text.primary }}>
          {name}
        </h3>
        <div ref={slotsRef} style={{ ...styles.slots, gap: isMobile ? '10px 8px' : '14px' }}>
          {deck.map((cardId, slotIndex) => {
            const slot = { deckIndex, slotIndex };
            const isDropTarget = board.dragOver?.deckIndex === deckIndex && board.dragOver?.slotIndex === slotIndex;
            return (
              <DeckSlot
                key={slotIndex}
                card={cardId != null ? cardById.get(cardId) ?? null : null}
                deckIndex={deckIndex}
                slotIndex={slotIndex}
                theme={theme}
                versionOverride={board.slotVersion[slotKey(deckIndex, slotIndex)]}
                isDragging={board.dragSource?.deckIndex === deckIndex && board.dragSource?.slotIndex === slotIndex}
                isDropTarget={isDropTarget}
                isInvalidDropTarget={isDropTarget && board.dragSource != null && board.isChampionViolation(board.dragSource, slot)}
                isTarget={slotIndex === target}
                onClick={() => onSlotClick(slotIndex)}
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

      <div
        style={
          isMobile
            ? styles.statsMobile
            : { ...styles.stats, borderLeftColor: theme.border }
        }
      >
        <div>
          <StageScore key={deckIndex} score={score} theme={theme} isMobile={isMobile} />
          <div style={{ ...styles.kind, color: theme.text.secondary }}>
            <ScoreKind score={score} filled={cards.length} theme={theme} />
          </div>
        </div>

        <dl style={{ ...styles.facts, ...(isMobile ? styles.factsMobile : {}) }}>
          <dt style={{ color: theme.text.secondary }}>Avg elixir</dt>
          <dd style={{ ...styles.fact, color: theme.text.primary }}>{cards.length ? avgElixir(cards).toFixed(1) : '–'}</dd>
          <dt style={{ color: theme.text.secondary }}>4-card cycle</dt>
          <dd style={{ ...styles.fact, color: theme.text.primary }}>{cycle ?? '–'}</dd>
          {complete && score?.isMeta && score.players != null && (
            <>
              <dt style={{ color: theme.text.secondary }}>Played by</dt>
              <dd style={{ ...styles.fact, color: theme.text.primary }}>{score.players} players</dd>
            </>
          )}
        </dl>

        {!isMobile && (
          <div>
            <div style={{ ...styles.curveTitle, color: theme.text.tertiary }}>Elixir curve</div>
            <div style={styles.curve}>
              {curve.map((count, i) => (
                <div
                  key={i}
                  className="wdb-bar"
                  title={`${count} ${count === 1 ? 'card' : 'cards'} costing ${CURVE_LABELS[i]}`}
                  style={{
                    ...styles.bar,
                    height: `${(Math.max(count, 0.15) / curveMax) * 100}%`,
                    backgroundColor: theme.text.primary,
                    opacity: count ? 0.85 : 0.15,
                  }}
                />
              ))}
            </div>
            <div style={{ ...styles.curveLabels, color: theme.text.tertiary }}>
              {CURVE_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        )}

        <div style={{ ...styles.actions, ...(isMobile ? styles.actionsMobile : {}) }}>
          {cards.length > 0 && (
            <div style={{ ...styles.buttons, ...(isMobile && styles.buttonsRow) }}>
              {complete && (
                <DeckLinkAction
                  link={buildDeckLink(deck)}
                  isMobile={isMobile}
                  className="mobile-touch-target"
                  style={{ ...styles.outlineButton, color: theme.text.primary, borderColor: theme.borderStrong }}
                  label={isMobile ? 'Open in Clash Royale' : 'Copy deck link'}
                />
              )}
              <button
                type="button"
                className="mobile-touch-target"
                onClick={() => board.resetDeck(deckIndex)}
                style={{ ...styles.outlineButton, color: theme.text.primary, borderColor: theme.borderStrong }}
              >
                <TrashIcon size={isMobile ? 18 : 13} />
                Clear deck
              </button>
            </div>
          )}
          <Link to="/faq#builder-score-symbols" style={{ ...styles.textLink, alignSelf: 'flex-start', color: theme.text.tertiary }}>
            How scores work
          </Link>
        </div>
      </div>
    </div>
  );
});

export default BuilderStage;

function StageScore({ score, theme, isMobile }: { score?: BuilderDeckScore; theme: Theme; isMobile: boolean }) {
  const value = useTween(score?.score ?? 0);
  return (
    <div style={{ ...styles.score, fontSize: isMobile ? '34px' : '44px', color: theme.text.primary }}>
      {score?.score == null ? '–' : value.toFixed(3)}
    </div>
  );
}

function ScoreKind({ score, filled, theme }: { score?: BuilderDeckScore; filled: number; theme: Theme }) {
  if (filled === 0) return <>Empty. Pick cards below to fill it.</>;
  const estimate = <span style={{ color: theme.text.tertiary }}>~ estimate</span>;
  if (filled < SLOTS_PER_DECK) return <>{estimate} · {filled} of 8 cards</>;
  if (!score || score.score == null) return <>{filled} of 8 cards</>;
  if (score.isMeta) {
    return (
      <>
        <span style={{ color: theme.text.primary }}>★ meta deck</span>
        {score.winRate != null && ` · ${Math.round(score.winRate * 100)}% win rate`}
      </>
    );
  }
  return <>{estimate}, not a known meta deck</>;
}

const styles = {
  stage: {
    display: 'grid' as const,
    alignItems: 'start' as const,
  },
  name: {
    fontWeight: 700 as const,
    margin: 0,
  },
  slots: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    maxWidth: '500px',
  },
  stats: {
    borderLeft: '1px solid',
    paddingLeft: '28px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '22px',
  },
  statsMobile: {
    display: 'grid' as const,
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    gap: '12px 18px',
    alignItems: 'center' as const,
  },
  score: {
    fontWeight: 700 as const,
    lineHeight: 1,
    letterSpacing: '-1px',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  kind: {
    fontSize: '13px',
    lineHeight: 1.45,
    marginTop: '6px',
  },
  facts: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr auto',
    gap: '9px 12px',
    margin: 0,
    fontSize: '14px',
  },
  factsMobile: {
    fontSize: '13px',
    gap: '4px 10px',
  },
  fact: {
    margin: 0,
    textAlign: 'right' as const,
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  curveTitle: {
    fontSize: '12.5px',
    marginBottom: '8px',
  },
  curve: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    gap: '6px',
    alignItems: 'end' as const,
    height: '64px',
  },
  bar: {
    borderRadius: '4px 4px 2px 2px',
    minHeight: '3px',
  },
  curveLabels: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    gap: '6px',
    fontSize: '11px',
    textAlign: 'center' as const,
    marginTop: '5px',
  },
  actions: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '14px',
  },
  actionsMobile: {
    gridColumn: '1 / -1',
  },
  buttons: {
    display: 'grid' as const,
    gap: '10px',
  },
  buttonsRow: {
    gridAutoFlow: 'column' as const,
    gridAutoColumns: 'minmax(0, 1fr)',
  },
  outlineButton: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '7px',
    boxSizing: 'border-box' as const,
    whiteSpace: 'nowrap' as const,
    fontFamily: 'inherit',
    height: '36px',
    padding: '0 14px',
    borderRadius: '10px',
    border: '1px solid',
    backgroundColor: 'transparent',
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
    cursor: 'pointer' as const,
  },
  textLink: {
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
};
