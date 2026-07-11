import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useBestDecks, fetchCollectionOnce } from '../queries';
import type { BestDeckSet } from '../api';
import { versionOf, orderBySlots } from '../lib/cardDisplay';
import { useIsMobile } from '../hooks/useIsMobile';
import CompactDeckRow from '../components/CompactDeckRow';
import UseInBuilderButton from '../components/UseInBuilderButton';
import { BestDecksSkeleton } from '../components/LoadingSkeletons';
import {
  DECK_COUNT,
  SLOTS_PER_DECK,
  slotKey,
  saveDecks,
  saveSlotVersions,
  type DeckState,
  type SlotVersionMap,
} from '../lib/deckBoard';

export default function BestWarDecks() {
  const { activePlayerTag } = useApp();
  const theme = getTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useBestDecks();
  const [copyingSetIdx, setCopyingSetIdx] = useState<number | null>(null);

  // Cards the active player doesn't own are left as empty slots; the builder
  // re-scores the board itself once mounted.
  async function copySetToBuilder(set: BestDeckSet, setIdx: number) {
    setCopyingSetIdx(setIdx);
    try {
      const ownedIds = new Set<number>();
      if (activePlayerTag) {
        const res = await fetchCollectionOnce(queryClient, activePlayerTag);
        res.cards.forEach((c) => ownedIds.add(c.id));
      }
      const filterByOwnership = !!activePlayerTag && ownedIds.size > 0;

      const orderedFor = (deckIdx: number) => {
        const deck = set.decks[deckIdx];
        return deck ? orderBySlots(deck.cards, (id) => versionOf(deck.cardVersions, id)) : [];
      };

      const newDecks: DeckState = Array.from({ length: DECK_COUNT }, (_, deckIdx) => {
        const ordered = orderedFor(deckIdx);
        return Array.from({ length: SLOTS_PER_DECK }, (__, slotIdx) => {
          const card = ordered[slotIdx];
          if (!card || (filterByOwnership && !ownedIds.has(card.id))) return null;
          return card.id;
        });
      });

      // Preserve which special art the "both" slot (index 2) shows per deck.
      const slotVersions: SlotVersionMap = {};
      set.decks.forEach((deck, deckIdx) => {
        const spill = orderedFor(deckIdx)[2];
        const version = spill ? versionOf(deck.cardVersions, spill.id) : 'normal';
        if (version === 'evo' || version === 'hero') {
          slotVersions[slotKey(deckIdx, 2)] = version;
        }
      });

      saveDecks(newDecks);
      saveSlotVersions(slotVersions);
      navigate('/builder');
    } catch {
    } finally {
      setCopyingSetIdx(null);
    }
  }

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div
        style={{
          ...styles.header,
          marginBottom: isMobile ? '20px' : '30px',
          paddingBottom: isMobile ? '14px' : '20px',
          borderBottomColor: theme.border,
        }}
      >
        <h2 style={{ color: theme.text.primary, margin: 0 }}>Best War Deck Sets</h2>
        <p style={{ ...styles.subtitle, color: theme.text.secondary }}>
          The strongest 4-deck combinations for war, ranked by meta performance. Assumes all cards are owned, max level, with all evolutions and heroes.
        </p>
      </div>

      {isLoading && <BestDecksSkeleton isMobile={isMobile} />}
      {isError && (
        <p style={{ ...styles.message, color: '#e05c5c' }}>
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}

      {data && (
        <div style={{ ...styles.setList, gap: isMobile ? '16px' : '24px' }}>
          {data.sets.map((set, setIdx) => (
            <section
              key={setIdx}
              style={{
                ...styles.setCard,
                padding: isMobile ? '16px 12px' : '20px 24px',
                borderColor: theme.border,
                backgroundColor: theme.bg.secondary,
              }}
            >
              <div style={{ ...styles.setHeader, borderBottomColor: theme.border }}>
                <div style={styles.setRank}>
                  <span style={{ ...styles.setRankNumber, color: theme.accent }}>#{setIdx + 1}</span>
                  <span style={{ ...styles.setRankLabel, color: theme.text.secondary }}>War Deck Set</span>
                </div>
                <div style={styles.setScore}>
                  <div style={{ ...styles.setScoreLabel, color: theme.text.secondary }}>Total Score</div>
                  <div style={{ ...styles.setScoreValue, color: theme.accent }}>{set.totalScore.toFixed(3)}</div>
                </div>
              </div>

              <div style={{ position: 'relative', paddingRight: isMobile ? 0 : '60px' }}>
                <div style={styles.rowList}>
                  {set.decks.map((deck, deckIdx) => (
                    <CompactDeckRow
                      key={deckIdx}
                      deck={deck}
                      theme={theme}
                      isMobile={isMobile}
                    />
                  ))}
                </div>
                {isMobile ? (
                  <UseInBuilderButton
                    onClick={() => copySetToBuilder(set, setIdx)}
                    busy={copyingSetIdx !== null}
                    spinning={copyingSetIdx === setIdx}
                    accent={theme.accent}
                    variant="full"
                  />
                ) : (
                  <div style={styles.gutter}>
                    <UseInBuilderButton
                      onClick={() => copySetToBuilder(set, setIdx)}
                      busy={copyingSetIdx !== null}
                      spinning={copyingSetIdx === setIdx}
                      accent={theme.accent}
                      variant="circle"
                    />
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
  },
  header: {
    borderBottom: '1px solid',
  },
  subtitle: {
    fontSize: '15px',
    margin: '8px 0 0',
  },
  message: {
    marginTop: '32px',
  },
  setList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  setCard: {
    border: '1px solid',
    borderRadius: '16px',
  },
  setHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: '16px',
    paddingBottom: '14px',
    borderBottom: '1px solid',
  },
  setRank: {
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    gap: '10px',
  },
  setRankNumber: {
    fontSize: '28px',
    fontWeight: 900 as const,
    lineHeight: 1,
    letterSpacing: '-0.5px',
  },
  setRankLabel: {
    fontSize: '12px',
    fontWeight: 700 as const,
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
  },
  setScore: {
    textAlign: 'right' as const,
  },
  setScoreLabel: {
    fontSize: '10px',
    fontWeight: 600 as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    marginBottom: '2px',
  },
  setScoreValue: {
    fontSize: '20px',
    fontWeight: 800 as const,
    lineHeight: 1,
  },
  rowList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '8px',
  },
  gutter: {
    position: 'absolute' as const,
    right: 0,
    top: 0,
    bottom: 0,
    width: '52px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
