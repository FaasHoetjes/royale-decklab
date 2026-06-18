import { useEffect, useMemo, useState } from 'react';
import DeckCard from './DeckCard';
import SwapDeckModal from './SwapDeckModal';

interface Card {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  elixirCost?: number;
  elixerCost?: number;
}

interface ScoredDeck {
  cardIds: number[];
  metaWinRate: number;
  confidence: number;
  uses: number;
  players: number;
  pickRate: number;
  playerScore: number;
  cardVersions?: Array<{ cardId: number; version: 'normal' | 'evo' | 'hero' }>;
  cards: Card[];
}

interface WarDeckResultProps {
  playerName: string;
  decks: ScoredDeck[];
  alternatives: ScoredDeck[];
  totalScore: number;
  onNewSearch: () => void;
  isDarkMode: boolean;
}

export default function WarDeckResult({
  playerName,
  decks,
  alternatives,
  onNewSearch,
  isDarkMode,
}: WarDeckResultProps) {
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
  // card-disjoint — the war rule that each card is fielded only once.
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

  const theme = {
    headerBg: isDarkMode ? '#2a2a2a' : '#ffffff',
    headerBorder: isDarkMode ? '#444444' : '#ddd',
    headerText: isDarkMode ? '#ffffff' : '#000000',
    buttonBg: isDarkMode ? '#4a9eff' : '#007bff',
  };

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
    <div style={styles.container}>
      <div style={{ ...styles.header, borderBottomColor: theme.headerBorder }}>
        <h2 style={{ color: theme.headerText }}>{playerName}'s Best War Decks</h2>
        <p style={{ ...styles.totalScore, color: theme.headerText }}>
          Total Score: <strong>{liveTotalScore.toFixed(3)}</strong>
        </p>
      </div>

      <div style={styles.decksGrid}>
        {slots.map((master, slotPos) => {
          const deck = deckAt(master);
          const options = candidatesForSlot(slotPos);
          return (
            <DeckCard
              key={slotPos}
              cards={deck.cards}
              metaWinRate={deck.metaWinRate}
              confidence={deck.confidence}
              uses={deck.uses}
              players={deck.players}
              pickRate={deck.pickRate}
              cardVersions={deck.cardVersions}
              playerScore={deck.playerScore}
              deckNumber={slotPos + 1}
              isDarkMode={isDarkMode}
              canSwap={options.length > 1}
              onSwap={() => setSwapSlot(slotPos)}
            />
          );
        })}
      </div>

      {swapSlot != null && (
        <SwapDeckModal
          slotNumber={swapSlot + 1}
          isDarkMode={isDarkMode}
          currentMaster={slots[swapSlot] ?? -1}
          options={candidatesForSlot(swapSlot).map((master) => {
            const d = deckAt(master);
            return {
              master,
              cards: d.cards,
              metaWinRate: d.metaWinRate,
              confidence: d.confidence,
              playerScore: d.playerScore,
              cardVersions: d.cardVersions,
            };
          })}
          onSelect={(master) => selectForSlot(swapSlot, master)}
          onClose={() => setSwapSlot(null)}
        />
      )}

      <div style={{ ...styles.footer, borderTopColor: theme.headerBorder }}>
        <button onClick={onNewSearch} style={{ ...styles.button, backgroundColor: theme.buttonBg }}>
          Search Another Player
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
    textAlign: 'center' as const,
    marginBottom: '50px',
    paddingBottom: '30px',
    borderBottom: '3px solid #007bff',
  },
  totalScore: {
    fontSize: '22px',
    color: '#333',
    marginTop: '15px',
    fontWeight: '500' as const,
  },
  decksGrid: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr',
    gap: '30px',
    marginBottom: '50px',
  },
  footer: {
    textAlign: 'center' as const,
    paddingTop: '30px',
    borderTop: '2px solid #ddd',
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
