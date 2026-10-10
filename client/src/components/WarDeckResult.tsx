import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ScoredDeck } from '../api';
import type { BuilderCard } from '../lib/builderCards';
import { DEFAULT_OPTIONS, deckKey, hasActiveOptions, type GeneratorOptions } from '../lib/generatorOptions';
import DeckCard from './DeckCard';
import { TrophyIcon } from './navIcons';
import GeneratorControls from './GeneratorControls';
import InfoTip from './InfoTip';
import SwapDeckModal from './SwapDeckModal';
import { useIsMobile } from '../hooks/useIsMobile';

interface WarDeckResultProps {
  playerName: string;
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
}

export default function WarDeckResult({
  playerName,
  decks,
  alternatives,
  onNewSearch,
  options,
  onOptionsChange,
  cards,
  isUpdating,
  updateFailed,
  onRetry,
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
  const [slotState, setSlotState] = useState(() => {
    const arranged = arrange();
    return { decks, arranged, slots: arranged };
  });
  let slots = slotState.slots;
  if (slotState.decks !== decks) {
    slots = arrange();
    setSlotState({ decks, arranged: slots, slots });
  }
  const swapped = slots.some((master, pos) => master !== slotState.arranged[pos]);
  const setSlots = (update: (prev: number[]) => number[]) =>
    setSlotState((prev) => ({ ...prev, slots: update(prev.slots) }));

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

  const selectForSlot = (slotPos: number, master: number) => {
    setSlots((prev) => prev.map((m, pos) => (pos === slotPos ? master : m)));
    setSwapSlot(null);
  };

  const liveTotalScore = slots.reduce((sum, master) => sum + deckAt(master).playerScore, 0);
  const customized = hasActiveOptions(options);

  // Back to the plain generated lineup: undo swaps, and clear any options (which fetches it again).
  const resetLineup = () => {
    setSlots(() => slotState.arranged);
    if (customized) {
      lockPositions.current.clear();
      onOptionsChange(DEFAULT_OPTIONS);
    }
  };

  // Not while updating: right after clearing the options, `decks` can still be an empty result for the old ones.
  if (decks.length === 0 && !customized && !isUpdating) {
    return <NoDecks onNewSearch={onNewSearch} isMobile={isMobile} />;
  }

  // While updating, `decks` still belongs to the previous options, so comparing it with the new
  // deck count would flash a false "only n of m decks fit" notice.
  const shortBy = isUpdating ? 0 : options.decks - decks.length;

  return (
    <div style={{ ...styles.container, padding: isMobile ? '8px 0' : '40px 20px' }}>
      <div
        style={{
          ...styles.header,
          padding: isMobile ? '18px 20px' : '28px 32px',
          marginBottom: isMobile ? '16px' : '24px',
          gap: isMobile ? '12px' : '20px',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          background: theme.headerGradient,
          border: `1px solid ${theme.headerBorder}`,
          boxShadow: theme.headerShadow,
          color: theme.title,
        }}
      >
        <div style={{ ...styles.headerInfo, ...(isMobile ? styles.headerInfoMobile : {}) }}>
          <span style={{ ...styles.eyebrow, color: theme.muted, opacity: 1 }}>WAR DECKS</span>
          <h2 style={{ ...styles.title, fontSize: isMobile ? '24px' : '32px', color: theme.title }}>{playerName}</h2>
          <span style={{ ...styles.subtitle, color: theme.muted, opacity: 1 }}>
            {slots.length === 0
              ? 'No decks fit your options'
              : `${slots.length} battle-ready deck${slots.length === 1 ? '' : 's'} · no shared cards`}
          </span>
        </div>
        <div style={{ ...styles.scoreBlock, flexShrink: isMobile ? 0 : undefined }}>
          <span style={{ ...styles.scoreLabel, color: theme.muted, opacity: 1 }}>
            Total Score
            <InfoTip
              ariaLabel="How the total score is derived"
              color={theme.muted}
              placement="bottom"
              align="right"
              interactive={isMobile}
            >
              The combined Player Score of your recommended decks.{' '}
              {isMobile ? (
                <>
                  See the{' '}
                  <Link to="/faq#player-score" style={styles.tooltipLink}>
                    FAQ
                  </Link>{' '}
                  for how each individual score is calculated.
                </>
              ) : (
                <>See a deck's Player Score tooltip for how each individual score is calculated.</>
              )}
            </InfoTip>
          </span>
          <span style={{ ...styles.scoreValue, fontSize: isMobile ? '24px' : '32px', color: theme.accent }}>{liveTotalScore.toFixed(3)}</span>
        </div>
      </div>

      <GeneratorControls
        options={options}
        onChange={onOptionsChange}
        canReset={customized || swapped}
        onReset={resetLineup}
        cards={cards}
        isUpdating={isUpdating}
        isMobile={isMobile}
      />

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

      {!updateFailed && shortBy > 0 && (
        <p style={styles.notice} role="status">
          {decks.length === 0
            ? 'No lineup fits these options. '
            : `Only ${decks.length} of ${options.decks} decks ${decks.length === 1 ? 'fits' : 'fit'} these options. `}
          Try a lower minimum level, fewer required cards or fewer bans.
        </p>
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
              playerScore={deck.playerScore}
              deckNumber={slotPos + 1}
              canSwap={!locked && swapOptions.length > 1}
              onSwap={() => setSwapSlot(slotPos)}
              priority={slotPos === 0}
              locked={locked}
              onToggleLock={() => toggleLock(slotPos)}
            />
          );
        })}
      </div>

      {swapSlot != null && (
        <SwapDeckModal
          slotNumber={swapSlot + 1}
          currentMaster={slots[swapSlot] ?? -1}
          options={candidatesForSlot(swapSlot).map((master) => {
            const d = deckAt(master);
            return {
              master,
              cards: d.cards,
              metaWinRate: d.metaWinRate,
              playerScore: d.playerScore,
              cardVersions: d.cardVersions,
            };
          })}
          onSelect={(master) => selectForSlot(swapSlot, master)}
          onClose={() => setSwapSlot(null)}
        />
      )}
    </div>
  );
}

const theme = {
  headerGradient: 'var(--banner-bg)',
  headerBorder: 'var(--banner-border)',
  headerShadow: 'var(--banner-shadow)',
  muted: 'var(--banner-muted)',
  title: 'var(--banner-title)',
  accent: 'var(--accent)',
};

/** Shown when not one popular war deck can be built from the player's cards. */
function NoDecks({ onNewSearch, isMobile }: { onNewSearch: () => void; isMobile: boolean }) {
  return (
    // Fills the screen above the footer so the content sits in the middle: the page's own padding and the
    // footer take about 100px on desktop; on phones the top bar and a taller, wrapped footer take about 180px.
    <div style={{ ...styles.empty, minHeight: isMobile ? 'calc(100dvh - 180px)' : 'calc(100dvh - 100px)' }} role="status">
      <div style={styles.emptyIcon} aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="3" width="12" height="16" rx="2" />
          <path d="M4 7v12a2 2 0 0 0 2 2h9" />
          <path d="M11 9l4 4M15 9l-4 4" />
        </svg>
      </div>
      <h2 style={styles.emptyTitle}>We couldn't build a war deck</h2>
      <p style={styles.emptyText}>
        None of the popular war decks can be built from your cards yet. Unlock a few more cards and check back.
      </p>
      <div style={{ ...styles.emptyActions, flexDirection: isMobile ? 'column' : 'row' }}>
        <Link to="/best-decks" style={{ ...styles.emptyButton, ...styles.emptyPrimary }}>
          <TrophyIcon />
          See the best war decks
        </Link>
        <button type="button" onClick={onNewSearch} style={styles.emptyButton}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          Search another player
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '40px 20px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  header: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '20px',
    flexWrap: 'wrap' as const,
    marginBottom: '40px',
    padding: '28px 32px',
    borderRadius: '20px',
    color: '#ffffff',
    boxShadow: '0 10px 30px rgba(0, 123, 255, 0.25)',
  },
  headerInfo: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '4px',
  },
  headerInfoMobile: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: '12px',
    fontWeight: 700 as const,
    letterSpacing: '2px',
    opacity: 0.8,
  },
  title: {
    margin: 0,
    fontSize: '32px',
    fontWeight: 800 as const,
    lineHeight: 1.1,
    color: '#ffffff',
  },
  subtitle: {
    fontSize: '13px',
    fontWeight: 500 as const,
    opacity: 0.85,
    marginTop: '2px',
  },
  scoreBlock: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'flex-end' as const,
  },
  scoreLabel: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
    fontSize: '11px',
    fontWeight: 700 as const,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    opacity: 0.85,
  },
  tooltipLink: {
    color: 'var(--accent-bright)',
    fontWeight: 700 as const,
    textDecoration: 'underline' as const,
  },
  scoreValue: {
    fontSize: '32px',
    fontWeight: 800 as const,
    lineHeight: 1.1,
    color: '#ffffff',
    marginTop: '2px',
  },
  decksGrid: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr',
    gap: '30px',
    marginBottom: '50px',
    transition: 'opacity 0.15s ease',
  },
  retry: {
    border: 0,
    background: 'none',
    padding: 0,
    font: 'inherit',
    color: 'var(--accent)',
    fontWeight: 700 as const,
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
  empty: {
    maxWidth: '420px',
    margin: '0 auto',
    padding: '24px 20px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    textAlign: 'center' as const,
  },
  emptyIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    display: 'grid' as const,
    placeItems: 'center' as const,
    color: 'var(--accent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    boxShadow: '0 0 0 8px color-mix(in srgb, var(--accent) 6%, transparent)',
  },
  emptyTitle: {
    margin: '22px 0 6px',
    fontSize: '20px',
    fontWeight: 800 as const,
    color: 'var(--text-primary)',
  },
  emptyText: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.55,
    color: 'var(--text-secondary)',
  },
  emptyActions: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    alignSelf: 'stretch' as const,
    gap: '10px',
    marginTop: '22px',
  },
  emptyButton: {
    height: '40px',
    padding: '0 16px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 700 as const,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  emptyPrimary: {
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
  },
};
