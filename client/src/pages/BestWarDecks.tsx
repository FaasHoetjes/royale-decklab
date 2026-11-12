import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useNavigationType } from 'react-router-dom';
import { getTheme } from '../theme';
import { useBestDecks } from '../queries';
import type { BestDeckSet } from '../api';
import { versionOf, orderBySlots } from '../lib/cardDisplay';
import { distinctDeckNames } from '../lib/archetypes';
import { deckKey } from '../lib/generatorOptions';
import { useIsMobile } from '../hooks/useIsMobile';
import { SetSection } from './BestWarSetSection';
import { BestDecksSkeleton } from '../components/LoadingSkeletons';
import LoadError from '../components/LoadError';
import {
  DECK_COUNT,
  SLOTS_PER_DECK,
  slotKey,
  saveDecks,
  saveSlotVersions,
  type DeckState,
  type SlotVersionMap,
} from '../lib/deckBoard';

// A set is remembered by its decks, not its rank, so it stays folded when the ranking shifts.
const setKey = (set: BestDeckSet) => set.decks.map((d) => deckKey(d.cardIds)).sort().join('|');

const FOLDED_KEY = 'bestDecks_folded';

// Enough to fill a screen. The rest render after the page appears, so tapping its tab doesn't wait on all ten.
const FIRST_SETS = 2;

function loadFolded(): ReadonlySet<string> {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(FOLDED_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

export default function BestWarDecks() {
  const theme = getTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { data, isLoading, isError, isFetching, refetch } = useBestDecks();
  const [foldedSets, setFoldedSets] = useState(loadFolded);
  // Back and forward restore the scroll position as the page mounts, so those need every set there at once.
  const navigationType = useNavigationType();
  const [allSets, setAllSets] = useState(navigationType === 'POP');
  useEffect(() => {
    if (data && !allSets) startTransition(() => setAllSets(true));
  }, [data, allSets]);

  const toggleSet = useCallback((key: string) => {
    setFoldedSets((folded) => {
      const next = new Set(folded);
      if (!next.delete(key)) next.add(key);
      try {
        sessionStorage.setItem(FOLDED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  // A deck can show up in several sets; it keeps one name, unique across the whole page.
  const deckNames = useMemo(() => {
    const unique = new Map<string, BestDeckSet['decks'][number]>();
    data?.sets.forEach((set) => set.decks.forEach((deck) => unique.set(deckKey(deck.cardIds), deck)));
    const keys = [...unique.keys()];
    const names = distinctDeckNames([...unique.values()].map((deck) => deck.cards));
    return new Map(keys.map((key, i) => [key, names[i]]));
  }, [data]);

  // The whole set goes over, also cards the player doesn't own: the builder marks those and scores the board itself.
  const copySetToBuilder = useCallback((set: BestDeckSet) => {
    const orderedFor = (deckIdx: number) => {
      const deck = set.decks[deckIdx];
      return deck ? orderBySlots(deck.cards, (id) => versionOf(deck.cardVersions, id)) : [];
    };

    const newDecks: DeckState = Array.from({ length: DECK_COUNT }, (_, deckIdx) => {
      const ordered = orderedFor(deckIdx);
      return Array.from({ length: SLOTS_PER_DECK }, (__, slotIdx) => ordered[slotIdx]?.id ?? null);
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
  }, [navigate]);

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div style={{ marginBottom: isMobile ? '18px' : '26px' }}>
        <h1 className={isMobile ? 'visually-hidden' : undefined} style={{ color: theme.text.primary, margin: 0, fontSize: '1.5em' }}>Best War Deck Sets</h1>
        <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined, color: theme.text.secondary }}>
          The strongest four deck war sets in the current meta. Assumes a maxed collection with all Evolutions and Heroes.
        </p>
      </div>

      {isLoading && <BestDecksSkeleton isMobile={isMobile} />}
      {isError && (
        <LoadError
          title="Couldn't load the best decks"
          message="Something went wrong on our end. Please try again in a moment."
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      )}

      {data && (
        <div style={{ ...styles.setList, gap: isMobile ? '14px' : '16px' }}>
          {(allSets ? data.sets : data.sets.slice(0, FIRST_SETS)).map((set, setIdx) => {
            const key = setKey(set);
            return (
              <SetSection
                key={key}
                set={set}
                setKey={key}
                setIdx={setIdx}
                expanded={!foldedSets.has(key)}
                deckNames={deckNames}
                isMobile={isMobile}
                onToggle={toggleSet}
                onCopy={copySetToBuilder}
              />
            );
          })}
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
  subtitle: {
    fontSize: '15px',
    margin: '8px 0 0',
  },
  setList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
};
