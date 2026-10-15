import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useBestDecks, fetchCollectionOnce } from '../queries';
import type { BestDeckSet } from '../api';
import { versionOf, orderBySlots } from '../lib/cardDisplay';
import { distinctDeckNames } from '../lib/archetypes';
import { useIsMobile } from '../hooks/useIsMobile';
import GeneratorHeader from '../components/GeneratorHeader';
import BestDeckRow from '../components/BestDeckRow';
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

const deckKey = (cardIds: number[]) => [...cardIds].sort((a, b) => a - b).join(',');
// A set is remembered by its decks, not its rank, so it stays folded when the ranking shifts.
const setKey = (set: BestDeckSet) => set.decks.map((d) => deckKey(d.cardIds)).sort().join('|');

const FOLDED_KEY = 'bestDecks_folded';

function loadFolded(): ReadonlySet<string> {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(FOLDED_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

export default function BestWarDecks() {
  const { activePlayerTag } = useApp();
  const theme = getTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useBestDecks();
  const [copyingSetIdx, setCopyingSetIdx] = useState<number | null>(null);
  const [foldedSets, setFoldedSets] = useState(loadFolded);

  function toggleSet(key: string) {
    const next = new Set(foldedSets);
    if (!next.delete(key)) next.add(key);
    setFoldedSets(next);
    try {
      sessionStorage.setItem(FOLDED_KEY, JSON.stringify([...next]));
    } catch {}
  }

  // A deck can show up in several sets; it keeps one name, unique across the whole page.
  const deckNames = useMemo(() => {
    const unique = new Map<string, BestDeckSet['decks'][number]>();
    data?.sets.forEach((set) => set.decks.forEach((deck) => unique.set(deckKey(deck.cardIds), deck)));
    const keys = [...unique.keys()];
    const names = distinctDeckNames([...unique.values()].map((deck) => deck.cards));
    return new Map(keys.map((key, i) => [key, names[i]]));
  }, [data]);

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
      <div style={{ marginBottom: isMobile ? '18px' : '26px' }}>
        {!isMobile && <h2 style={{ color: theme.text.primary, margin: 0 }}>Best War Deck Sets</h2>}
        <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined, color: theme.text.secondary }}>
          The strongest four deck war sets in the current meta. Assumes a maxed collection with all Evolutions and Heroes.
        </p>
      </div>

      {isLoading && <BestDecksSkeleton isMobile={isMobile} />}
      {isError && (
        <p style={{ ...styles.message, color: '#e05c5c' }}>
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}

      {data && (
        <div style={{ ...styles.setList, gap: isMobile ? '14px' : '16px' }}>
          {data.sets.map((set, setIdx) => {
            const key = setKey(set);
            const expanded = !foldedSets.has(key);
            const rowsId = `best-set-${setIdx + 1}-decks`;
            return (
              <section key={key}>
                <GeneratorHeader
                  rank={setIdx + 1}
                  decks={set.decks}
                  totalScore={set.totalScore}
                  scoreTip="The four decks' meta scores added up. Sets are ranked by it."
                  isMobile={isMobile}
                  style={{ marginBottom: 0, ...(isMobile ? {} : { minHeight: '118px' }) }}
                  toggle={{
                    expanded,
                    onToggle: () => toggleSet(key),
                    controls: rowsId,
                    label: `${expanded ? 'Hide' : 'Show'} the decks of set ${setIdx + 1}`,
                  }}
                >
                  <button
                    type="button"
                    className="mobile-touch-target"
                    onClick={() => copySetToBuilder(set, setIdx)}
                    disabled={copyingSetIdx !== null}
                    style={{
                      ...styles.useButton,
                      ...(isMobile ? { alignSelf: 'stretch' } : {}),
                      backgroundColor: theme.accent,
                      color: theme.onAccent,
                      cursor: copyingSetIdx !== null ? 'wait' : 'pointer',
                      opacity: copyingSetIdx !== null && copyingSetIdx !== setIdx ? 0.6 : 1,
                    }}
                  >
                    <BuilderIcon spinning={copyingSetIdx === setIdx} />
                    Use set in builder
                  </button>
                </GeneratorHeader>

                <div
                  id={rowsId}
                  style={{
                    ...styles.fold,
                    gridTemplateRows: expanded ? '1fr' : '0fr',
                    opacity: expanded ? 1 : 0,
                    visibility: expanded ? 'visible' : 'hidden',
                    transition: expanded ? styles.fold.transition : `${styles.fold.transition}, visibility 0s linear 0.3s`,
                  }}
                >
                  <div style={{ minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ ...styles.rowList, padding: isMobile ? '12px 0 18px' : '12px 0 20px' }}>
                      {set.decks.map((deck, deckIdx) => (
                        <BestDeckRow
                          key={deckIdx}
                          deck={deck}
                          name={deckNames.get(deckKey(deck.cardIds)) ?? `Deck ${deckIdx + 1}`}
                          theme={theme}
                          isMobile={isMobile}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BuilderIcon({ spinning }: { spinning: boolean }) {
  if (spinning) {
    return (
      <svg viewBox="0 0 24 24" style={{ ...styles.icon, animation: 'spin 1s linear infinite' }} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" style={styles.icon} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="9" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
      <rect x="14" y="15" width="7" height="6" rx="1.5" />
    </svg>
  );
}

const styles = {
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
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
  useButton: {
    alignSelf: 'flex-start' as const,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    marginTop: '10px',
    height: '40px',
    padding: '0 16px',
    border: 'none',
    borderRadius: '10px',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
  },
  icon: {
    width: '16px',
    height: '16px',
    display: 'block' as const,
    flexShrink: 0,
  },
  fold: {
    display: 'grid' as const,
    transition: 'grid-template-rows 0.3s ease, opacity 0.25s ease',
  },
  rowList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '10px',
  },
};
