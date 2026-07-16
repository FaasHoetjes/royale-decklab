import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ScoredDeck } from '../api';
import DeckCard from './DeckCard';
import InfoTip from './InfoTip';
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
  const allDecks = useMemo(() => [...decks, ...alternatives], [decks, alternatives]);
  const deckAt = (master: number): ScoredDeck => {
    const deck = allDecks[master];
    if (!deck) throw new Error(`No deck at index ${master}`);
    return deck;
  };

  const [slots, setSlots] = useState<number[]>(() => decks.map((_, i) => i));
  useEffect(() => {
    setSlots(decks.map((_, i) => i));
  }, [decks]);

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
          <span style={{ ...styles.subtitle, color: theme.muted, opacity: 1 }}>4 battle-ready decks · no shared cards</span>
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
              The combined Player Score of all four recommended decks.{' '}
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

      <div
        style={{
          ...styles.decksGrid,
          gap: isMobile ? '16px' : '30px',
          marginBottom: isMobile ? 0 : '50px',
        }}
      >
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
              priority={slotPos === 0}
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
