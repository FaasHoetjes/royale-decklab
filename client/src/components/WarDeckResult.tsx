import { useMemo, useRef, useState } from 'react';
import type { ScoredDeck } from '../api';
import type { BuilderCard } from '../lib/builderCards';
import { DEFAULT_OPTIONS, deckKey, hasActiveOptions, type GeneratorOptions } from '../lib/generatorOptions';
import DeckCard from './DeckCard';
import GeneratorControls from './GeneratorControls';
import GeneratorHeader from './GeneratorHeader';
import ShareLineupButton from './ShareLineupButton';
import SwapDeckModal from './SwapDeckModal';
import NoDecks from './warDeck/NoDecks';
import Shortfall from './warDeck/Shortfall';
import { alignToReference, inOrder, orderBySlots, slotVersionOf } from '../lib/cardDisplay';
import { useIsMobile } from '../hooks/useIsMobile';
import { encodeShare } from '../lib/shareLink';

interface WarDeckResultProps {
  playerName: string;
  playerTag: string;
  decks: ScoredDeck[];
  alternatives: ScoredDeck[];
  onNewSearch: () => void;
  options: GeneratorOptions;
  onOptionsChange: (options: GeneratorOptions) => void;
  /** Catalog marked with the player's collection, for the ban / must-include pickers. */
  cards: BuilderCard[];
  isUpdating: boolean;
  /** The last options change failed; the decks shown are from before it. */
  updateFailed?: boolean;
  onRetry?: () => void;
  /**
   * Someone else's lineup opened from a share link: read-only, with a way to the reader's own decks. `decks`
   * holds each deck's cards in the order the sharer saw them.
   */
  shared?: { onGetMine: () => void; decks: number[][] };
}

interface KeptOrder {
  master: number;
  ids: number[];
}

interface LineupState {
  decks: ScoredDeck[];
  arranged: number[];
  slots: number[];
  orders: Record<number, KeptOrder>;
}

export default function WarDeckResult({
  playerName,
  playerTag,
  decks,
  alternatives,
  onNewSearch,
  options,
  onOptionsChange,
  cards,
  isUpdating,
  updateFailed,
  onRetry,
  shared,
}: WarDeckResultProps) {
  const isMobile = useIsMobile();
  const lockedKeys = useMemo(() => new Set(options.lock.map(deckKey)), [options.lock]);
  // Where each deck was when it was locked: the API returns locked decks first, but they should stay put.
  const lockPositions = useRef(new Map<string, number>());
  const allDecks = useMemo(() => [...decks, ...alternatives], [decks, alternatives]);
  const deckAt = (master: number): ScoredDeck => {
    const deck = allDecks[master];
    if (!deck) throw new Error(`No deck at index ${master}`);
    return deck;
  };

  const arrange = (): number[] => {
    const order: (number | null)[] = decks.map(() => null);
    const rest: number[] = [];
    decks.forEach((deck, i) => {
      const key = deckKey(deck.cardIds);
      const pos = lockedKeys.has(key) ? lockPositions.current.get(key) : undefined;
      if (pos != null && pos < order.length && order[pos] == null) order[pos] = i;
      else rest.push(i);
    });
    return order.map((master) => master ?? rest.shift()!);
  };

  // Re-arranged in the same render a new result arrives, so old positions never index into the new list.
  // `arranged` is the lineup as generated; `slots` also reflects swaps made since.
  const [slotState, setSlotState] = useState<LineupState>(() => {
    const arranged = arrange();
    return { decks, arranged, slots: arranged, orders: {} };
  });
  let slots = slotState.slots;
  if (slotState.decks !== decks) {
    slots = arrange();
    setSlotState({ decks, arranged: slots, slots, orders: {} });
  }
  const swapped = slots.some((master, pos) => master !== slotState.arranged[pos]);

  const toggleLock = (slotPos: number) => {
    const deck = deckAt(slots[slotPos]!);
    const key = deckKey(deck.cardIds);
    if (lockedKeys.has(key)) {
      lockPositions.current.delete(key);
      onOptionsChange({ ...options, lock: options.lock.filter((d) => deckKey(d) !== key) });
    } else {
      lockPositions.current.set(key, slotPos);
      onOptionsChange({ ...options, lock: [...options.lock, deck.cardIds] });
    }
  };

  const [swapSlot, setSwapSlot] = useState<number | null>(null);

  const candidatesForSlot = (slotPos: number): number[] => {
    const otherCards = new Set<number>();
    slots.forEach((master, pos) => {
      if (pos !== slotPos) deckAt(master).cardIds.forEach((id) => otherCards.add(id));
    });

    const base = [slotPos, ...alternatives.map((_, k) => decks.length + k)];
    const valid = base.filter(
      (master) => !deckAt(master).cardIds.some((id) => otherCards.has(id))
    );
    valid.sort((a, b) => deckAt(b).playerScore - deckAt(a).playerScore);
    return valid;
  };

  const cardOrderAt = (slotPos: number): number[] => {
    const master = slots[slotPos]!;
    const kept = slotState.orders[slotPos];
    if (kept?.master === master) return kept.ids;
    const deck = deckAt(master);
    const asShared = shared?.decks.find((ids) => deckKey(ids) === deckKey(deck.cardIds));
    if (asShared) return asShared;
    return orderBySlots(deck.cards, slotVersionOf(deck.metaCardVersions, deck.cardVersions)).map((c) => c.id);
  };

  const selectForSlot = (slotPos: number, master: number) => {
    const current = deckAt(slots[slotPos]!);
    const next = deckAt(master);
    const ids = alignToReference(
      next.cards,
      slotVersionOf(next.metaCardVersions, next.cardVersions),
      inOrder(current.cards, cardOrderAt(slotPos))
    ).map((c) => c.id);
    setSlotState((prev) => ({
      ...prev,
      slots: prev.slots.map((m, pos) => (pos === slotPos ? master : m)),
      orders: { ...prev.orders, [slotPos]: { master, ids } },
    }));
    setSwapSlot(null);
  };

  const liveTotalScore = slots.reduce((sum, master) => sum + deckAt(master).playerScore, 0);
  const customized = hasActiveOptions(options);

  // Back to the plain generated lineup: undo swaps, and clear any options (which fetches it again).
  const resetLineup = () => {
    setSlotState((prev) => ({ ...prev, slots: prev.arranged, orders: {} }));
    if (customized) {
      lockPositions.current.clear();
      onOptionsChange(DEFAULT_OPTIONS);
    }
  };

  const shareCode = encodeShare(slots.map((_, slotPos) => cardOrderAt(slotPos)));
  const shareUrl = `${window.location.origin}/${playerTag.replace('#', '')}${shareCode ? `?share=${shareCode}` : ''}`;

  // Not while updating: right after clearing the options, `decks` can still be an empty result for the old ones.
  if (decks.length === 0 && !customized && !isUpdating && !shared) {
    return <NoDecks onNewSearch={onNewSearch} isMobile={isMobile} />;
  }

  // While updating, `decks` still belongs to the previous options, so comparing it with the new
  // deck count would flash a false "only n of m decks fit" notice.
  const shortBy = isUpdating ? 0 : options.decks - decks.length;

  return (
    <div style={{ ...styles.container, padding: isMobile ? '8px 0' : '40px 20px' }}>
      {shared && (
        <div style={{ ...styles.sharedNotice, ...(isMobile && styles.sharedNoticeMobile) }} role="note">
          <span>
            <b style={styles.sharedBy}>{playerName} shared these war decks.</b> Want the best ones for your cards?
          </span>
          <button type="button" onClick={shared.onGetMine} style={styles.getMine}>
            Get my decks
          </button>
        </div>
      )}

      <GeneratorHeader
        title={playerName}
        eyebrow={shared ? `${playerName}'s war decks` : undefined}
        decks={slots.map(deckAt)}
        totalScore={liveTotalScore}
        isMobile={isMobile}
      >
        {decks.length > 0 && <ShareLineupButton url={shareUrl} title={`${playerName}'s war decks`} isMobile={isMobile} />}
      </GeneratorHeader>

      {!shared && (
        <GeneratorControls
          options={options}
          onChange={onOptionsChange}
          canReset={customized || swapped}
          onReset={resetLineup}
          cards={cards}
          isUpdating={isUpdating}
          isMobile={isMobile}
        />
      )}

      {updateFailed && (
        <p style={styles.notice} role="alert">
          Couldn't update your decks just now; the decks below are from before your last change. Wait a few
          seconds and{' '}
          <button type="button" onClick={onRetry} style={styles.retry}>
            try again
          </button>
          .
        </p>
      )}

      {!updateFailed && !shared && shortBy > 0 && (
        <Shortfall found={decks.length} options={options} onChange={onOptionsChange} isMobile={isMobile} />
      )}

      <div
        style={{
          ...styles.decksGrid,
          gap: isMobile ? '16px' : '30px',
          marginBottom: isMobile ? 0 : '50px',
          opacity: isUpdating ? 0.55 : 1,
        }}
        aria-busy={isUpdating}
      >
        {slots.map((master, slotPos) => {
          const deck = deckAt(master);
          const locked = lockedKeys.has(deckKey(deck.cardIds));
          const swapOptions = candidatesForSlot(slotPos);
          return (
            <DeckCard
              key={slotPos}
              cards={deck.cards}
              metaWinRate={deck.metaWinRate}
              uses={deck.uses}
              players={deck.players}
              pickRate={deck.pickRate}
              cardVersions={deck.cardVersions}
              metaCardVersions={deck.metaCardVersions}
              cardOrder={cardOrderAt(slotPos)}
              playerScore={deck.playerScore}
              deckNumber={slotPos + 1}
              canSwap={!shared && !locked && swapOptions.length > 1}
              onSwap={() => setSwapSlot(slotPos)}
              priority={slotPos === 0}
              locked={!shared && locked}
              onToggleLock={shared ? undefined : () => toggleLock(slotPos)}
            />
          );
        })}
      </div>

      {swapSlot != null && (
        <SwapDeckModal
          slotNumber={swapSlot + 1}
          currentMaster={slots[swapSlot] ?? -1}
          currentCardOrder={cardOrderAt(swapSlot)}
          options={candidatesForSlot(swapSlot).map((master) => {
            const d = deckAt(master);
            return {
              master,
              cards: d.cards,
              metaWinRate: d.metaWinRate,
              playerScore: d.playerScore,
              uses: d.uses,
              cardVersions: d.cardVersions,
              metaCardVersions: d.metaCardVersions,
            };
          })}
          onSelect={(master) => selectForSlot(swapSlot, master)}
          onClose={() => setSwapSlot(null)}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '40px 20px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  decksGrid: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr',
    gap: '30px',
    marginBottom: '50px',
    transition: 'opacity 0.15s ease',
  },
  sharedNotice: {
    margin: '0 0 16px',
    padding: '12px 14px 12px 18px',
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '10px 16px',
    borderRadius: '14px',
    border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 12%, var(--bg-secondary))',
    fontSize: '14px',
    lineHeight: 1.45,
    color: 'var(--text-secondary)',
  },
  sharedNoticeMobile: {
    margin: '0 0 12px',
    padding: '12px 14px',
  },
  sharedBy: {
    color: 'var(--text-primary)',
  },
  getMine: {
    height: '36px',
    padding: '0 14px',
    border: 'none',
    borderRadius: '10px',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 700 as const,
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
  },
  retry: {
    border: 0,
    background: 'none',
    padding: 0,
    font: 'inherit',
    color: 'var(--accent)',
    fontWeight: 600 as const,
    textDecoration: 'underline' as const,
    cursor: 'pointer',
  },
  notice: {
    margin: '0 0 20px',
    padding: '12px 16px',
    borderRadius: '10px',
    fontSize: '14px',
    lineHeight: 1.5,
    backgroundColor: 'var(--chip-bg)',
    border: '1px solid var(--chip-border)',
    color: 'var(--text-primary)',
  },
};
