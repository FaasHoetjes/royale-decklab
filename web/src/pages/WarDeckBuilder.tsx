import { useState, useEffect, useMemo, type DragEvent } from 'react';
import CardPicker, { type BuilderCard, type FilterKey } from '../components/CardPicker';
import type { ScoreDeckCard } from '../api';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useAllCards, usePlayerCollection, useDeckScores } from '../queries';
import { useDebouncedValue } from '../useDebouncedValue';
import { slotKind, slotBorderStyle, cardFrame, type SlotKind } from '../slotStyles';
import { buildDeckLink, isCompleteDeck } from '../deckLink';

type SpecialVersion = 'evo' | 'hero';

// Which special art a card placed in a given slot can show, gated by what the
// player actually OWNS (and by the art existing). The evo slot only offers evo,
// the hero slot only hero; the "both" slot offers whichever the player owns —
// and when they own both, the user gets a toggle to switch between them.
function availableVersions(card: BuilderCard, kind: SlotKind | null): SpecialVersion[] {
  const canEvo = !!card.hasEvo && !!card.iconUrls?.evolutionMedium;
  const canHero = !!card.ownsHero && !!card.iconUrls?.heroMedium;
  if (kind === 'evo') return canEvo ? ['evo'] : [];
  if (kind === 'hero') return canHero ? ['hero'] : [];
  if (kind === 'both') {
    const versions: SpecialVersion[] = [];
    if (canEvo) versions.push('evo');
    if (canHero) versions.push('hero');
    return versions;
  }
  return [];
}

const DECK_COUNT = 4;
const SLOTS_PER_DECK = 8;

// Champions may only occupy the 2nd/3rd slots (the hero + both slots, indices
// 1 and 2). Picking a champion routes it into the first free one of these.
const CHAMPION_SLOTS = [1, 2];

type DeckState = (number | null)[][];

const emptyDecks = (): DeckState =>
  Array.from({ length: DECK_COUNT }, () =>
    Array.from({ length: SLOTS_PER_DECK }, () => null)
  );

export default function WarDeckBuilder() {
  const { isDarkMode, activePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);
  // The one accent for a meta-backed score — gold in dark, blue in light —
  // matching the swap modal's win-rate accent.
  const scoreAccent = isDarkMode ? '#e8b24a' : '#007bff';

  // Server data via React Query — the catalog is effectively static and the
  // collection is keyed by the active player. Both are cached and shared with
  // the rest of the app (e.g. Best Decks' copy-to-builder), so revisiting the
  // builder paints from cache instead of re-fetching.
  const cardsQuery = useAllCards();
  const catalog = cardsQuery.data ?? [];
  const collectionQuery = usePlayerCollection(activePlayerTag);
  const owned = collectionQuery.data ?? [];

  const loading = cardsQuery.isLoading;
  const loadError = cardsQuery.error ?? collectionQuery.error;
  const error = loadError instanceof Error ? loadError.message : '';

  const [decks, setDecks] = useState<DeckState>(() => {
    try {
      const saved = sessionStorage.getItem('wdb_decks');
      return saved ? JSON.parse(saved) : emptyDecks();
    } catch {
      return emptyDecks();
    }
  });
  const [picker, setPicker] = useState<{ deckIndex: number; slotIndex: number } | null>(null);
  // Card-picker sort + filters live here (not inside CardPicker) so they survive
  // the picker unmounting on close — reopening it to add another card keeps the
  // same filtering instead of resetting every time.
  const [pickerFilters, setPickerFilters] = useState<Set<FilterKey>>(new Set());
  const [pickerSortIndex, setPickerSortIndex] = useState(0);
  const [pickerDescending, setPickerDescending] = useState(false);

  // Per-slot override of which special art shows, keyed by `${deck}-${slot}`.
  // Only meaningful for slots where the player owns more than one version
  // (the "both" slot with both evo + hero unlocked); otherwise the sole
  // available version is used and this stays empty.
  const [slotVersion, setSlotVersion] = useState<Record<string, SpecialVersion>>(() => {
    try {
      const saved = sessionStorage.getItem('wdb_slotVersion');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Drag-to-swap state: the slot a drag started from, and the slot currently
  // hovered as a drop target (for the highlight).
  const [dragSource, setDragSource] = useState<{ deckIndex: number; slotIndex: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ deckIndex: number; slotIndex: number } | null>(null);

  // Persist only the user's actual work — the decks they're building and their
  // per-slot art choices — across navigations. Server data (catalog, owned,
  // scores) is owned by React Query, not sessionStorage.
  useEffect(() => { sessionStorage.setItem('wdb_decks', JSON.stringify(decks)); }, [decks]);
  useEffect(() => { sessionStorage.setItem('wdb_slotVersion', JSON.stringify(slotVersion)); }, [slotVersion]);

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
        // Whether the card CAN be a hero — a hero icon exists, or the catalog
        // says it reaches evolution tier 2. Used to list it under Hero & Champion.
        isHero: !!ownedCard?.iconUrls?.heroMedium || (c.maxEvolutionLevel ?? 0) >= 2,
        // Ownership signals. evolutionLevel is per-player and tracks which tier the
        // player has unlocked: 0 = neither, >= 1 = evo tier, >= 2 = hero tier — the
        // same signal the backend scorer uses. The iconUrls (both evolutionMedium
        // AND heroMedium) appear for every card that CAN evolve / be a hero, not
        // just owned ones, so they're useless as ownership signals — only the
        // per-player evolutionLevel proves the tier is unlocked.
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

  const usedIds = useMemo(() => {
    const set = new Set<number>();
    decks.forEach((deck) => deck.forEach((id) => id != null && set.add(id)));
    return set;
  }, [decks]);

  // The cards actually placed on the board, with the player's levels + owned
  // evo/hero tier. Sending only these means the server never re-fetches the
  // collection — scoring stays reactive without hammering the Clash Royale API.
  const scoreCards = useMemo<ScoreDeckCard[]>(() => {
    return [...usedIds]
      .map((id) => cardById.get(id))
      .filter((c): c is BuilderCard => c != null && c.level != null)
      .map((c) => ({
        id: c.id,
        level: c.level as number,
        maxLevel: c.maxLevel ?? 16,
        // The scorer only needs the tier thresholds (>=1 evo, >=2 hero), which
        // the builder tracks as the owned-version booleans.
        evolutionLevel: c.ownsHero ? 2 : c.hasEvo ? 1 : 0,
        rarity: c.rarity,
      }));
  }, [usedIds, cardById]);

  // Debounce the scoring inputs together so a flurry of edits scores once.
  // useDeckScores dedupes identical arrangements (same key → cached) and keeps
  // the previous scores on-screen while a new arrangement is scored.
  const scoreInput = useMemo(() => ({ cards: scoreCards, decks }), [scoreCards, decks]);
  const debouncedInput = useDebouncedValue(scoreInput, 300);
  const scoreQuery = useDeckScores(
    debouncedInput.cards,
    debouncedInput.decks,
    debouncedInput.cards.length > 0
  );
  // An empty board has no score. Gating on the (undebounced) placed count drops
  // the score the instant the board is cleared, rather than lingering on the
  // last arrangement's result until the query settles.
  const scores = usedIds.size > 0 ? scoreQuery.data ?? null : null;

  // Drop any version override for a slot — used whenever its card changes, so a
  // new card never inherits the previous occupant's evo/hero choice.
  const clearVersions = (...keys: string[]) =>
    setSlotVersion((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });

  const setSlot = (deckIndex: number, slotIndex: number, value: number | null) => {
    setDecks((prev) =>
      prev.map((deck, di) =>
        di === deckIndex ? deck.map((id, si) => (si === slotIndex ? value : id)) : deck
      )
    );
    clearVersions(`${deckIndex}-${slotIndex}`);
  };

  const handleSelectCard = (cardId: number) => {
    if (!picker) return;
    const card = cardById.get(cardId);
    let target = picker.slotIndex;
    // Champions are confined to the hero/both slots. If the clicked slot isn't
    // one of them, route the champion into the first free champion slot instead.
    if (card?.rarity === 'champion' && !CHAMPION_SLOTS.includes(picker.slotIndex)) {
      const free = CHAMPION_SLOTS.find((i) => decks[picker.deckIndex]?.[i] == null);
      if (free == null) return; // no room — picker should have hidden champions
      target = free;
    }
    setSlot(picker.deckIndex, target, cardId);
    setPicker(null);
  };

  const handleSlotClick = (deckIndex: number, slotIndex: number) => {
    const current = decks[deckIndex]?.[slotIndex];
    if (current != null) {
      // Filled slot → remove the card (frees it for reuse).
      setSlot(deckIndex, slotIndex, null);
    } else {
      // Empty slot → open the picker.
      setPicker({ deckIndex, slotIndex });
    }
  };

  // Swap (or move, if the target is empty) the cards between two slots. Because
  // the destination slot may be a different kind, both version overrides are
  // dropped so each card re-derives its art from its new slot.
  const swapSlots = (
    a: { deckIndex: number; slotIndex: number },
    b: { deckIndex: number; slotIndex: number }
  ) => {
    if (a.deckIndex === b.deckIndex && a.slotIndex === b.slotIndex) return;
    setDecks((prev) => {
      const next = prev.map((deck) => [...deck]);
      const tmp = next[a.deckIndex]![a.slotIndex]!;
      next[a.deckIndex]![a.slotIndex] = next[b.deckIndex]![b.slotIndex]!;
      next[b.deckIndex]![b.slotIndex] = tmp;
      return next;
    });
    clearVersions(`${a.deckIndex}-${a.slotIndex}`, `${b.deckIndex}-${b.slotIndex}`);
  };

  // Returns true when dropping dragSource onto target would violate the champion-slot rule.
  const isChampionViolation = (
    src: { deckIndex: number; slotIndex: number },
    tgt: { deckIndex: number; slotIndex: number }
  ): boolean => {
    const draggedId = decks[src.deckIndex]?.[src.slotIndex];
    const targetId = decks[tgt.deckIndex]?.[tgt.slotIndex];
    const draggedCard = draggedId != null ? cardById.get(draggedId) : null;
    const targetCard = targetId != null ? cardById.get(targetId) : null;
    if (draggedCard?.rarity === 'champion' && !CHAMPION_SLOTS.includes(tgt.slotIndex)) return true;
    if (targetCard?.rarity === 'champion' && !CHAMPION_SLOTS.includes(src.slotIndex)) return true;
    return false;
  };

  const handleDragStart = (e: DragEvent, deckIndex: number, slotIndex: number) => {
    if (decks[deckIndex]?.[slotIndex] == null) {
      e.preventDefault();
      return;
    }
    setDragSource({ deckIndex, slotIndex });
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set for a drag to actually start.
    e.dataTransfer.setData('text/plain', `${deckIndex}:${slotIndex}`);
  };

  const handleDragOver = (e: DragEvent, deckIndex: number, slotIndex: number) => {
    if (!dragSource) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = isChampionViolation(dragSource, { deckIndex, slotIndex }) ? 'none' : 'move';
    if (dragOver?.deckIndex !== deckIndex || dragOver?.slotIndex !== slotIndex) {
      setDragOver({ deckIndex, slotIndex });
    }
  };

  const handleDrop = (e: DragEvent, deckIndex: number, slotIndex: number) => {
    e.preventDefault();
    if (!dragSource) return;

    // Champions may only live in CHAMPION_SLOTS. If the swap would place a
    // champion in a plain slot (or displace a champion to one), cancel the drop.
    const draggedId = decks[dragSource.deckIndex]?.[dragSource.slotIndex];
    const targetId = decks[deckIndex]?.[slotIndex];
    const draggedCard = draggedId != null ? cardById.get(draggedId) : null;
    const targetCard = targetId != null ? cardById.get(targetId) : null;
    if (draggedCard?.rarity === 'champion' && !CHAMPION_SLOTS.includes(slotIndex)) {
      setDragSource(null);
      setDragOver(null);
      return;
    }
    if (targetCard?.rarity === 'champion' && !CHAMPION_SLOTS.includes(dragSource.slotIndex)) {
      setDragSource(null);
      setDragOver(null);
      return;
    }

    swapSlots(dragSource, { deckIndex, slotIndex });
    setDragSource(null);
    setDragOver(null);
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOver(null);
  };

  // Clear every slot in a single deck (and drop that deck's version overrides).
  const resetDeck = (deckIndex: number) => {
    setDecks((prev) =>
      prev.map((deck, di) => (di === deckIndex ? deck.map(() => null) : deck))
    );
    clearVersions(...Array.from({ length: SLOTS_PER_DECK }, (_, si) => `${deckIndex}-${si}`));
  };

  // Clear all four decks at once and wipe every version override.
  const resetAll = () => {
    setDecks(emptyDecks());
    setSlotVersion({});
  };

  // Flip a "both" slot between the player's owned evo and hero art.
  const toggleVersion = (deckIndex: number, slotIndex: number, versions: SpecialVersion[]) => {
    const key = `${deckIndex}-${slotIndex}`;
    setSlotVersion((prev) => {
      const current = prev[key] ?? versions[0];
      const other = versions.find((v) => v !== current) ?? versions[0]!;
      return { ...prev, [key]: other };
    });
  };

  // Is an evo/hero version toggle currently shown anywhere? Only then do we
  // surface the footnote explaining why both versions are offered.
  const hasVersionToggle = decks.some((deck) =>
    deck.some((id, slotIndex) => {
      if (id == null || slotKind(slotIndex) !== 'both') return false;
      const card = cardById.get(id);
      return card ? availableVersions(card, 'both').length > 1 : false;
    })
  );

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, borderBottomColor: theme.border }}>
        <div style={styles.titleRow}>
          <h2 style={{ color: theme.text.primary, margin: 0 }}>War Deck Builder</h2>
          <div style={styles.titleRowRight}>
            {scores && scores.total > 0 && (
              <span
                style={{ ...styles.totalScore, color: theme.text.primary, borderColor: theme.border }}
                title="Sum of all four deck scores. Meta decks (★) are scored exactly like the auto-generated recommendations (win rate × fieldability × how widely they're played); the rest (~) are unproven estimates, dampened to sit below any proven meta deck."
              >
                <span style={{ ...styles.totalScoreLabel, color: theme.text.secondary }}>Total Score</span>
                <span style={{ color: scoreAccent }}>{scores.total.toFixed(3)}</span>
              </span>
            )}
            {usedIds.size > 0 && (
              <button
                onClick={resetAll}
                aria-label="Clear all four decks"
                style={{ ...styles.resetAllBtn, color: theme.text.secondary, borderColor: theme.border }}
                title="Clear all four decks"
              >
                ⟲
              </button>
            )}
          </div>
        </div>
        <p style={{ ...styles.subtitle, color: theme.text.secondary, marginTop: '8px' }}>
          Each card can be used once across all four decks. Click a slot to choose a card; drag a card to swap it with another slot; click a filled card to remove it.
        </p>
        {loading && <p style={{ color: theme.text.secondary }}>Loading cards…</p>}
      </div>

      <div style={styles.deckList}>
        {decks.map((deck, deckIndex) => (
          <div
            key={deckIndex}
            style={{
              ...styles.deck,
              backgroundColor: theme.bg.secondary,
              borderColor: theme.border,
            }}
          >
            <div style={styles.deckHeader}>
              <h3 style={{ ...styles.deckTitle, color: theme.text.primary }}>Deck {deckIndex + 1}</h3>
              <div style={styles.deckHeaderStats}>
                {isCompleteDeck(deck) && (
                  <a
                    href={buildDeckLink(deck)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open Deck ${deckIndex + 1} in Clash Royale`}
                    style={{ ...styles.openInGameBtn, color: scoreAccent, borderColor: theme.border }}
                    title="Open this deck in Clash Royale"
                  >
                    <svg viewBox="0 0 24 24" style={styles.openInGameBtnIcon} aria-hidden="true">
                      <path fill="currentColor" d="M8 5v14l11-7z" />
                    </svg>
                  </a>
                )}
                {deck.some((id) => id != null) && (
                  <button
                    onClick={() => resetDeck(deckIndex)}
                    aria-label={`Clear Deck ${deckIndex + 1}`}
                    style={{ ...styles.resetDeckBtn, color: theme.text.secondary, borderColor: theme.border }}
                    title={`Clear Deck ${deckIndex + 1}`}
                  >
                    ⟲
                  </button>
                )}
                {(() => {
                  // Average elixir over the cards actually placed in this deck.
                  // Shown only once at least one card is in, so an empty deck
                  // doesn't read as "0.0".
                  const costs = deck
                    .map((id) => (id != null ? cardById.get(id)?.elixirCost : null))
                    .filter((c): c is number => c != null);
                  if (costs.length === 0) return null;
                  const avg = costs.reduce((sum, c) => sum + c, 0) / costs.length;
                  return (
                    <span style={{ ...styles.deckAvgElixir, color: theme.text.secondary }}>
                      <svg viewBox="0 0 28 30" style={styles.deckAvgElixirDrop} aria-hidden="true">
                        <path
                          d="M24 5 Q24 18 22.8 24.9 A12 12 0 0 1 1.7 13.9 Q6 6 24 5 Z"
                          fill="#d63bd6"
                          stroke="#000000"
                          strokeWidth="1.6"
                        />
                      </svg>
                      Avg {avg.toFixed(1)}
                    </span>
                  );
                })()}
                {(() => {
                  // Player score for this deck. A meta-matched deck (★, accent) is
                  // scored exactly like the auto-generated recommendations (so a
                  // hand-built meta deck reads on the same scale and can't outrank
                  // them); any other deck (~, muted) is an unproven estimate using a
                  // neutral 50% prior, dampened below proven decks. Nothing shows
                  // until a card is placed.
                  const ds = scores?.decks[deckIndex];
                  if (!ds || ds.score == null) return null;
                  const filled = deck.filter((id) => id != null).length;
                  const winPct = ((ds.winRate ?? 0) * 100).toFixed(1);
                  const fieldPct = ((ds.fieldability ?? 0) * 100).toFixed(0);
                  if (ds.isMeta) {
                    return (
                      <span
                        style={{ ...styles.deckScore, color: scoreAccent }}
                        title={`Meta deck — same score as the auto-generated decks: ${winPct}% win rate × ${fieldPct}% fieldability × how widely it's played (${ds.players} player${ds.players === 1 ? '' : 's'}).`}
                      >
                        ★ {ds.score.toFixed(3)}
                      </span>
                    );
                  }
                  return (
                    <span
                      style={{ ...styles.deckScore, color: theme.text.secondary }}
                      title={
                        `Estimated${filled < SLOTS_PER_DECK ? ` (${filled}/${SLOTS_PER_DECK} cards)` : ''} — not a known meta deck. Assumes a 50% win rate ` +
                        `× ${fieldPct}% fieldability (how close to maxed you can field it), then dampened for being unproven (no one on record runs it) so it ranks below any proven meta deck. Build a known meta deck to score higher.`
                      }
                    >
                      ~ {ds.score.toFixed(3)}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div style={styles.slotGrid}>
              {deck.map((cardId, slotIndex) => {
                const card = cardId != null ? cardById.get(cardId) : null;
                const displayLevel =
                  card && card.level != null
                    ? card.level + (16 - (card.maxLevel ?? 16))
                    : null;
                // The first three positions are the evo / hero / either slots.
                const kind = slotKind(slotIndex);

                // Which special art to show: gated by what the player owns and
                // by the slot kind. The "both" slot with both versions owned
                // shows a toggle so the user picks.
                const versions = card ? availableVersions(card, kind) : [];
                const slotKey = `${deckIndex}-${slotIndex}`;
                const override = slotVersion[slotKey];
                const activeVersion =
                  override && versions.includes(override) ? override : versions[0];
                const iconUrl =
                  activeVersion === 'hero'
                    ? card?.iconUrls?.heroMedium ?? card?.iconUrls?.medium
                    : activeVersion === 'evo'
                      ? card?.iconUrls?.evolutionMedium ?? card?.iconUrls?.medium
                      : card?.iconUrls?.medium;
                const canToggle = versions.length > 1;

                const isDragging =
                  dragSource?.deckIndex === deckIndex && dragSource?.slotIndex === slotIndex;
                const isDropTarget =
                  dragOver?.deckIndex === deckIndex && dragOver?.slotIndex === slotIndex;
                const isInvalidDropTarget =
                  isDropTarget && dragSource != null &&
                  isChampionViolation(dragSource, { deckIndex, slotIndex });

                return (
                  <button
                    key={slotIndex}
                    onClick={() => handleSlotClick(deckIndex, slotIndex)}
                    draggable={card != null}
                    onDragStart={(e) => handleDragStart(e, deckIndex, slotIndex)}
                    onDragOver={(e) => handleDragOver(e, deckIndex, slotIndex)}
                    onDrop={(e) => handleDrop(e, deckIndex, slotIndex)}
                    onDragEnd={handleDragEnd}
                    style={{
                      ...styles.slot,
                      cursor: card ? 'grab' : 'pointer',
                      opacity: isDragging ? 0.4 : 1,
                    }}
                    title={
                      card
                        ? `${card.name}${displayLevel != null ? ` · Level ${displayLevel}/16` : ''} (drag to swap · click to remove)`
                        : 'Click to add a card'
                    }
                  >
                    {card ? (
                        <div
                          style={{
                            ...styles.slotCard,
                            ...(kind ? slotBorderStyle(kind, isDarkMode) : cardFrame(isDarkMode)),
                            ...(isInvalidDropTarget ? styles.slotDropTargetInvalid : isDropTarget ? styles.slotDropTarget : {}),
                          }}
                        >
                          {iconUrl && (
                            <img src={iconUrl} alt={card.name} style={styles.slotImage} />
                          )}
                          {canToggle && (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Showing ${activeVersion} art — switch version`}
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleVersion(deckIndex, slotIndex, versions);
                              }}
                              style={{
                                ...styles.versionToggle,
                                backgroundColor:
                                  activeVersion === 'hero' ? '#f5a623' : '#a03cf0',
                              }}
                              title={`Showing ${activeVersion === 'hero' ? 'Hero' : 'Evolution'} — click to switch. The Clash Royale API can't tell Evolution-only from Hero ownership apart, so both are offered; pick the one you actually own.`}
                            >
                              ⇄ {activeVersion === 'hero' ? 'Hero' : 'Evo'}
                            </span>
                          )}
                          {card.elixirCost != null && (
                            <div style={styles.slotElixir}>
                              <svg viewBox="0 0 28 30" style={styles.slotElixirDrop} aria-hidden="true">
                                <defs>
                                  <radialGradient id="builderElixirGrad" cx="36%" cy="62%" r="70%">
                                    <stop offset="0%" stopColor="#f6a8ff" />
                                    <stop offset="45%" stopColor="#d63bd6" />
                                    <stop offset="100%" stopColor="#a0149e" />
                                  </radialGradient>
                                </defs>
                                <path
                                  d="M24 5 Q24 18 22.8 24.9 A12 12 0 0 1 1.7 13.9 Q6 6 24 5 Z"
                                  fill="url(#builderElixirGrad)"
                                  stroke="#000000"
                                  strokeWidth="1.6"
                                />
                                <ellipse cx="9" cy="14" rx="2.4" ry="3.4" fill="rgba(255,255,255,0.55)" transform="rotate(-20 9 14)" />
                              </svg>
                              <span style={styles.slotElixirText}>{card.elixirCost}</span>
                            </div>
                          )}
                          {displayLevel != null && (
                            <div style={styles.slotLevel}>LEVEL {displayLevel}</div>
                          )}
                        </div>
                    ) : (
                      <div
                        style={{
                          ...styles.slotEmpty,
                          // The default empty-slot border is near-black for the
                          // dark theme; soften it to a subtle line in light mode.
                          ...(isDarkMode ? {} : { border: `2px solid ${theme.border}` }),
                          // Fill the interior with the deck surface so an empty
                          // special slot blends in like the plain slots. Must be
                          // a gradient (image) not a bare colour: a colour in
                          // this layer lets the border gradient bleed through,
                          // which is the "blueish inside" of the empty slots.
                          ...(kind
                            ? slotBorderStyle(
                                kind,
                                isDarkMode,
                                `linear-gradient(${theme.bg.secondary}, ${theme.bg.secondary})`,
                                false
                              )
                            : {}),
                          ...(isInvalidDropTarget ? styles.slotDropTargetInvalid : isDropTarget ? styles.slotDropTarget : {}),
                        }}
                      >
                        <span style={{ ...styles.plus, color: theme.text.secondary }}>+</span>
                      </div>
                    )}
                    {/* Always render the name row (a non-breaking space when the
                        slot is empty) so filling a slot never changes the row's
                        height and pushes the card up. */}
                    <div style={{ ...styles.slotName, color: theme.text.primary }}>
                      {card ? card.name : ' '}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {hasVersionToggle && (
        <p style={{ ...styles.versionNote, color: theme.text.secondary }}>
          <span style={{ ...styles.versionNoteIcon, borderColor: theme.text.secondary }}>i</span>
          The <strong>⇄</strong> badge lets you switch a card's Evolution / Hero art. The Clash
          Royale API doesn't tell us which of the two you own — it only reports one combined
          level — so both are offered whenever the data allows. Pick the version you actually
          have; it doesn't affect anyone else's view or the deck's score.
        </p>
      )}

      {error && <div style={styles.errorBanner}>{error}</div>}

      {picker && (
        <CardPicker
          cards={builderCards}
          usedIds={usedIds}
          onSelect={handleSelectCard}
          onClose={() => setPicker(null)}
          isDarkMode={isDarkMode}
          filters={pickerFilters}
          setFilters={setPickerFilters}
          sortIndex={pickerSortIndex}
          setSortIndex={setPickerSortIndex}
          descending={pickerDescending}
          setDescending={setPickerDescending}
          allowChampions={CHAMPION_SLOTS.some((i) => decks[picker.deckIndex]?.[i] == null)}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '20px 0',
  },
  subtitle: {
    fontSize: '15px',
  },
  header: {
    marginBottom: '30px',
    paddingBottom: '20px',
    borderBottom: '1px solid #e0e0e0',
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
    fontSize: '17px',
    lineHeight: 1,
    cursor: 'pointer',
  },
  resetDeckBtn: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'none',
    border: '1px solid',
    borderRadius: '50%',
    width: '26px',
    height: '26px',
    padding: 0,
    fontSize: '14px',
    lineHeight: 1,
    cursor: 'pointer',
  },
  openInGameBtn: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'none',
    border: '1px solid',
    borderRadius: '50%',
    width: '26px',
    height: '26px',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'none',
  },
  openInGameBtnIcon: {
    width: '13px',
    height: '13px',
    display: 'block' as const,
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
  deckList: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr',
    gap: '24px',
  },
  deck: {
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    padding: '20px',
  },
  deckHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: '16px',
  },
  deckTitle: {
    margin: 0,
    fontSize: '16px',
  },
  deckHeaderStats: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '14px',
  },
  deckAvgElixir: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    fontSize: '13px',
    fontWeight: 700 as const,
  },
  deckScore: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '3px',
    fontSize: '13px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    cursor: 'help' as const,
  },
  deckAvgElixirDrop: {
    width: '15px',
    height: '16px',
    filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4))',
  },
  slotGrid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: '10px',
  },
  slot: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    display: 'block',
    width: '100%',
    userSelect: 'none' as const,
  },
  slotCard: {
    position: 'relative' as const,
    aspectRatio: '0.82',
    borderRadius: '10px',
    overflow: 'hidden' as const,
    border: '2px solid rgba(0, 0, 0, 0.15)',
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.25)',
    background: 'linear-gradient(160deg, #2a3a6a 0%, #16213f 100%)',
  },
  slotImage: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  // Highlight a slot while a dragged card hovers over it.
  slotDropTarget: {
    outline: '3px solid #4dabf7',
    outlineOffset: '2px',
  },
  slotDropTargetInvalid: {
    outline: '3px solid #ff6b6b',
    outlineOffset: '2px',
  },
  // Footnote under the decks explaining the evo/hero toggle + the API limitation.
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
  // Small pill, top-right of a "both" slot, to flip between owned evo/hero art.
  versionToggle: {
    position: 'absolute' as const,
    top: '3px',
    right: '3px',
    zIndex: 2,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '2px',
    padding: '2px 5px',
    borderRadius: '999px',
    color: '#ffffff',
    fontSize: '9px',
    fontWeight: 800 as const,
    letterSpacing: '0.3px',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
    userSelect: 'none' as const,
  },
  slotElixir: {
    position: 'absolute' as const,
    top: '3px',
    left: '3px',
    width: '23px',
    height: '25px',
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
  },
  slotElixirDrop: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
  },
  slotElixirText: {
    position: 'absolute' as const,
    left: 0,
    right: '8%',
    top: '60%',
    transform: 'translateY(-50%)',
    textAlign: 'center' as const,
    color: 'white',
    fontWeight: 'bold' as const,
    fontSize: '11px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
  },
  slotLevel: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent)',
    color: 'white',
    fontSize: '11px',
    fontWeight: 800 as const,
    letterSpacing: '0.5px',
    textAlign: 'center' as const,
    padding: '12px 0 4px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
  },
  slotEmpty: {
    aspectRatio: '0.82',
    border: '2px solid rgba(0, 0, 0, 0.4)',
    borderRadius: '10px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  slotName: {
    fontSize: '10px',
    fontWeight: 600 as const,
    textAlign: 'center' as const,
    marginTop: '5px',
    lineHeight: 1.1,
    // Reserve the row's height even when empty so filling a slot doesn't
    // grow the row and shove the card upward.
    minHeight: '12px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  plus: {
    fontSize: '28px',
    fontWeight: 300 as const,
  },
  errorBanner: {
    marginTop: '20px',
    backgroundColor: '#ff6b6b',
    color: 'white',
    padding: '12px 16px',
    borderRadius: '8px',
  },
};
