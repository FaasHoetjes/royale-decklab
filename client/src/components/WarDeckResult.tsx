import { useEffect, useMemo, useState } from 'react';
import type { ScoredDeck } from '../api';
import DeckCard from './DeckCard';
import SwapDeckModal from './SwapDeckModal';
import { useIsMobile } from '../hooks/useIsMobile';

interface WarDeckResultProps {
  playerName: string;
  decks: ScoredDeck[];
  alternatives: ScoredDeck[];
  onNewSearch: () => void;
}

export default function WarDeckResult({
  playerName,
  decks,
  alternatives,
  onNewSearch,
}: WarDeckResultProps) {
  const isMobile = useIsMobile();
  // One flat list the slots index into: the four primary decks first (master
  // indices 0..3), then the swap pool. A slot's "own" primary deck is the deck
  // at its own position, so primary index === slot position.
  const allDecks = useMemo(() => [...decks, ...alternatives], [decks, alternatives]);
  // Indices here are always built from allDecks, so the lookup never misses;
  // this just satisfies the strict indexed-access check in one place.
  const deckAt = (master: number): ScoredDeck => {
    const deck = allDecks[master];
    if (!deck) throw new Error(`No deck at index ${master}`);
    return deck;
  };

  // Which deck (master index) each of the four slots currently shows. Starts on
  // the four recommended decks; a new search remounts this component, but reset
  // defensively when the deck set itself changes.
  const [slots, setSlots] = useState<number[]>(() => decks.map((_, i) => i));
  useEffect(() => {
    setSlots(decks.map((_, i) => i));
  }, [decks]);

  // Which slot's swap picker is currently open (null = none).
  const [swapSlot, setSwapSlot] = useState<number | null>(null);

  // All valid swap options for one slot: its own primary deck plus the shared
  // pool, dropping any deck that shares a card with the three decks the other
  // slots currently show, best score first. Because every option is disjoint
  // from the other three, swapping keeps all four shown decks mutually
  // card-disjoint, the war rule that each card is fielded only once.
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

  if (decks.length === 0) {
    return (
      <div style={styles.container}>
        <p style={styles.error}>
          Could not find 4 non-overlapping decks for your card collection.
          Try getting more cards!
        </p>
        <button onClick={onNewSearch} style={{ ...styles.button, backgroundColor: theme.buttonBg }}>
          Search Another Player
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, padding: isMobile ? '8px 0' : '40px 20px' }}>
      <div
        style={{
          ...styles.header,
          padding: isMobile ? '18px 20px' : '28px 32px',
          marginBottom: isMobile ? '20px' : '40px',
          background: theme.headerGradient,
          border: `1px solid ${theme.headerBorder}`,
          boxShadow: theme.headerShadow,
        }}
      >
        <div style={styles.headerInfo}>
          <span style={{ ...styles.eyebrow, color: theme.muted, opacity: 1 }}>WAR DECKS</span>
          <h2 style={{ ...styles.title, fontSize: isMobile ? '24px' : '32px' }}>{playerName}</h2>
          <span style={{ ...styles.subtitle, color: theme.muted, opacity: 1 }}>4 battle-ready decks · no shared cards</span>
        </div>
        <div style={styles.scoreBlock}>
          <span style={{ ...styles.scoreLabel, color: theme.muted, opacity: 1 }}>Total Score</span>
          <span style={{ ...styles.scoreValue, fontSize: isMobile ? '24px' : '32px' }}>{liveTotalScore.toFixed(3)}</span>
        </div>
      </div>

      <div style={{ ...styles.decksGrid, gap: isMobile ? '16px' : '30px' }}>
        {slots.map((master, slotPos) => {
          const deck = deckAt(master);
          const options = candidatesForSlot(slotPos);
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
              canSwap={options.length > 1}
              onSwap={() => setSwapSlot(slotPos)}
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

// All CSS variables (index.css). The banner is a flat fill: dark matches the
// deck-card background so the hero reads as part of the same surface; light
// keeps the solid blue banner with translucent-white labels.
const theme = {
  headerGradient: 'var(--banner-bg)',
  headerBorder: 'var(--banner-border)',
  headerShadow: 'var(--banner-shadow)',
  muted: 'var(--banner-muted)',
  buttonBg: 'var(--cta-btn-bg)',
};

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
    fontSize: '11px',
    fontWeight: 700 as const,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    opacity: 0.85,
  },
  // Match the player name (styles.title): same size, weight, and white color.
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
  },
  button: {
    padding: '14px 32px',
    fontSize: '16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0, 123, 255, 0.2)',
  },
  error: {
    color: '#d32f2f',
    padding: '30px',
    textAlign: 'center' as const,
    fontSize: '16px',
  },
};
