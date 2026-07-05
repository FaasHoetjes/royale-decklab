import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useAllCards, usePlayerCollection, useDeckScores } from '../queries';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useIsMobile } from '../hooks/useIsMobile';
import { useDeckBoard } from '../hooks/useDeckBoard';
import { CHAMPION_SLOTS, SLOTS_PER_DECK } from '../lib/deckBoard';
import { availableVersions, type BuilderCard } from '../lib/builderCards';
import { slotKind } from '../lib/slotStyles';
import type { ScoreDeckCard } from '../api';
import { loadPickerPrefs, savePickerPrefs, type FilterKey } from '../lib/pickerData';
import CardPicker from '../components/CardPicker';
import DeckPanel from '../components/DeckPanel';
import TrashIcon from '../components/TrashIcon';

export default function WarDeckBuilder() {
  const { isDarkMode, activePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);
  const isMobile = useIsMobile();
  // The one accent for a meta-backed score; matches the generator's accent.
  const scoreAccent = isDarkMode ? '#e8b24a' : '#007bff';

  // Server data via React Query, cached and shared with the rest of the app
  // (e.g. Best Decks' copy-to-builder), so revisiting paints from cache.
  const cardsQuery = useAllCards();
  const catalog = cardsQuery.data ?? [];
  const collectionQuery = usePlayerCollection(activePlayerTag);
  const owned = collectionQuery.data ?? [];

  const loading = cardsQuery.isLoading;
  const loadError = cardsQuery.error ?? collectionQuery.error;
  const error = loadError instanceof Error ? loadError.message : '';

  // Merge catalog with ownership into the builder view model.
  const builderCards = useMemo<BuilderCard[]>(() => {
    const ownedById = new Map(owned.map((c) => [c.id, c]));
    return catalog.map((c) => {
      const ownedCard = ownedById.get(c.id);
      return {
        id: c.id,
        name: c.name,
        elixirCost: c.elixirCost,
        rarity: c.rarity,
        owned: !!ownedCard,
        level: ownedCard?.level,
        maxLevel: ownedCard?.maxLevel ?? c.maxLevel,
        // CAN be a hero: a hero icon exists or the catalog reaches evo tier 2.
        isHero: !!ownedCard?.iconUrls?.heroMedium || (c.maxEvolutionLevel ?? 0) >= 2,
        // Ownership: only the per-player evolutionLevel proves a tier is
        // unlocked (>= 1 evo, >= 2 hero). The iconUrls exist for every card
        // that CAN evolve, owned or not, so they're useless as signals.
        hasEvo: (ownedCard?.evolutionLevel ?? 0) >= 1,
        ownsHero: (ownedCard?.evolutionLevel ?? 0) >= 2,
        iconUrls: {
          medium: c.iconUrls?.medium,
          evolutionMedium: c.iconUrls?.evolutionMedium,
          heroMedium: ownedCard?.iconUrls?.heroMedium,
        },
      };
    });
  }, [catalog, owned]);

  const cardById = useMemo(
    () => new Map(builderCards.map((c) => [c.id, c])),
    [builderCards]
  );

  const board = useDeckBoard(cardById);

  const [picker, setPicker] = useState<{ deckIndex: number; slotIndex: number } | null>(null);
  // Picker sort + filters live here (not in the picker, which unmounts on
  // close) and persist to sessionStorage like the board, so they also survive
  // navigating to another page and back.
  const [initialPrefs] = useState(loadPickerPrefs);
  const [pickerFilters, setPickerFilters] = useState<Set<FilterKey>>(
    () => new Set(initialPrefs.filters)
  );
  const [pickerSortIndex, setPickerSortIndex] = useState(initialPrefs.sortIndex);
  const [pickerDescending, setPickerDescending] = useState(initialPrefs.descending);
  useEffect(() => {
    savePickerPrefs({
      filters: [...pickerFilters],
      sortIndex: pickerSortIndex,
      descending: pickerDescending,
    });
  }, [pickerFilters, pickerSortIndex, pickerDescending]);

  // The placed cards with the player's levels + owned tiers. Sending only
  // these means the server never re-fetches the collection while scoring.
  const scoreCards = useMemo<ScoreDeckCard[]>(() => {
    return [...board.usedIds]
      .map((id) => cardById.get(id))
      .filter((c): c is BuilderCard => c != null && c.level != null)
      .map((c) => ({
        id: c.id,
        level: c.level as number,
        maxLevel: c.maxLevel ?? 16,
        evolutionLevel: c.ownsHero ? 2 : c.hasEvo ? 1 : 0,
        rarity: c.rarity,
      }));
  }, [board.usedIds, cardById]);

  // Debounce the scoring inputs together so a flurry of edits scores once;
  // useDeckScores dedupes identical arrangements and keeps the previous
  // scores on-screen while a new arrangement is scored.
  const scoreInput = useMemo(() => ({ cards: scoreCards, decks: board.decks }), [scoreCards, board.decks]);
  const debouncedInput = useDebouncedValue(scoreInput, 300);
  const scoreQuery = useDeckScores(
    debouncedInput.cards,
    debouncedInput.decks,
    debouncedInput.cards.length > 0
  );
  // Gate on the undebounced count so clearing the board drops the score
  // instantly instead of lingering on the last arrangement's result.
  const scores = board.usedIds.size > 0 ? scoreQuery.data ?? null : null;

  const handleSelectCard = (cardId: number) => {
    if (!picker) return;
    board.placeCard(picker, cardId);
    setPicker(null);
  };

  // Surface the evo/hero footnote only while a version toggle is on-screen.
  const hasVersionToggle = board.decks.some((deck) =>
    deck.some((id, slotIndex) => {
      if (id == null || slotKind(slotIndex) !== 'both') return false;
      const card = cardById.get(id);
      return card ? availableVersions(card, 'both').length > 1 : false;
    })
  );

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div
        style={{
          ...styles.header,
          borderBottomColor: theme.border,
          marginBottom: isMobile ? '20px' : '30px',
          paddingBottom: isMobile ? '14px' : '20px',
        }}
      >
        <div style={styles.titleRow}>
          <h2 style={{ color: theme.text.primary, margin: 0 }}>War Deck Builder</h2>
          <div style={styles.titleRowRight}>
            {scores && scores.total > 0 && (
              <span
                style={{ ...styles.totalScore, color: theme.text.primary, borderColor: theme.border }}
                title="Sum of all four deck scores. Meta decks (★) are scored exactly like the auto-generated recommendations (the win rate you can expect at your card levels × how widely they're played); the rest (~) are unproven estimates, dampened to sit below any proven meta deck. An owned Evolution or Hero placed outside its colored slot costs a small penalty: the game would field it as the normal version there."
              >
                <span style={{ ...styles.totalScoreLabel, color: theme.text.secondary }}>Total Score</span>
                <span style={{ color: scoreAccent }}>{scores.total.toFixed(3)}</span>
              </span>
            )}
            {board.usedIds.size > 0 && (
              <button
                onClick={board.resetAll}
                aria-label="Clear all four decks"
                title="Clear all four decks"
                style={{ ...styles.resetAllBtn, color: theme.text.secondary, borderColor: theme.border }}
              >
                <TrashIcon size={16} />
              </button>
            )}
          </div>
        </div>
        <p style={{ ...styles.subtitle, color: theme.text.secondary }}>
          Each card can be used once across all four decks. Click a slot to choose a card; drag a card to swap it with another slot; click a filled card to remove it.
        </p>
        {loading && <p style={{ color: theme.text.secondary }}>Loading cards…</p>}
      </div>

      <div style={{ ...styles.deckList, gap: isMobile ? '14px' : '24px' }}>
        {board.decks.map((_, deckIndex) => (
          <DeckPanel
            key={deckIndex}
            deckIndex={deckIndex}
            board={board}
            cardById={cardById}
            score={scores?.decks[deckIndex]}
            scoreAccent={scoreAccent}
            theme={theme}
            isDarkMode={isDarkMode}
            isMobile={isMobile}
            onOpenPicker={(slotIndex) => setPicker({ deckIndex, slotIndex })}
          />
        ))}
      </div>

      {hasVersionToggle && (
        <p style={{ ...styles.versionNote, color: theme.text.secondary }}>
          <span style={{ ...styles.versionNoteIcon, borderColor: theme.text.secondary }}>i</span>
          The <strong>⇄</strong> badge lets you switch a card's Evolution / Hero art. The Clash
          Royale API doesn't tell us which of the two you own (it only reports one combined
          level), so both are offered whenever the data allows. Pick the version you actually
          have; it doesn't affect anyone else's view or the deck's score.
        </p>
      )}

      {error && <div style={styles.errorBanner}>{error}</div>}

      {picker && (
        <CardPicker
          cards={builderCards}
          usedIds={board.usedIds}
          onSelect={handleSelectCard}
          onClose={() => setPicker(null)}
          isDarkMode={isDarkMode}
          filters={pickerFilters}
          setFilters={setPickerFilters}
          sortIndex={pickerSortIndex}
          setSortIndex={setPickerSortIndex}
          descending={pickerDescending}
          setDescending={setPickerDescending}
          allowChampions={CHAMPION_SLOTS.some((i) => board.decks[picker.deckIndex]?.[i] == null)}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    borderBottom: '1px solid',
  },
  titleRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  titleRowRight: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  subtitle: {
    fontSize: '15px',
    marginTop: '8px',
  },
  totalScore: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    padding: '6px 14px',
    borderRadius: '999px',
    border: '1.5px solid',
    fontSize: '16px',
    fontWeight: 800 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    cursor: 'help' as const,
  },
  totalScoreLabel: {
    fontSize: '11px',
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  resetAllBtn: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'none',
    border: '1.5px solid',
    borderRadius: '50%',
    width: '34px',
    height: '34px',
    padding: 0,
    cursor: 'pointer',
  },
  deckList: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr',
  },
  versionNote: {
    display: 'flex' as const,
    alignItems: 'flex-start' as const,
    gap: '8px',
    maxWidth: '760px',
    margin: '4px auto 0',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  versionNoteIcon: {
    flexShrink: 0,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '15px',
    height: '15px',
    marginTop: '1px',
    borderRadius: '50%',
    border: '1px solid',
    fontSize: '10px',
    fontStyle: 'italic' as const,
    fontWeight: 'bold' as const,
    lineHeight: 1,
  },
  errorBanner: {
    marginTop: '20px',
    backgroundColor: '#ff6b6b',
    color: 'white',
    padding: '12px 16px',
    borderRadius: '8px',
  },
};
