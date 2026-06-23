import { useState, useEffect, useMemo, type DragEvent } from 'react';
import CardPicker, { type BuilderCard, type FilterKey } from '../components/CardPicker';
import {
  fetchAllCards,
  fetchPlayerCollection,
  scoreBuilderDecks,
  type CatalogCard,
  type OwnedCard,
  type ScoreDecksResponse,
} from '../api';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { slotKind, slotBorderStyle, type SlotKind } from '../slotStyles';

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

  const [catalog, setCatalog] = useState<CatalogCard[]>([]);
  const [owned, setOwned] = useState<OwnedCard[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [decks, setDecks] = useState<DeckState>(emptyDecks);
  const [picker, setPicker] = useState<{ deckIndex: number; slotIndex: number } | null>(null);
  // Card-picker sort + filters live here (not inside CardPicker) so they survive
  // the picker unmounting on close — reopening it to add another card keeps the
  // same filtering instead of resetting every time.
  const [pickerFilters, setPickerFilters] = useState<Set<FilterKey>>(new Set());
  const [pickerSortIndex, setPickerSortIndex] = useState(0);
  const [pickerDescending, setPickerDescending] = useState(false);

  // Player score per deck + the total across all four, scored on the backend
  // (meta match → real score, otherwise a level-based fieldability score). Null
  // until the first scoring round trip returns.
  const [scores, setScores] = useState<ScoreDecksResponse | null>(null);

  // Per-slot override of which special art shows, keyed by `${deck}-${slot}`.
  // Only meaningful for slots where the player owns more than one version
  // (the "both" slot with both evo + hero unlocked); otherwise the sole
  // available version is used and this stays empty.
  const [slotVersion, setSlotVersion] = useState<Record<string, SpecialVersion>>({});

  // Drag-to-swap state: the slot a drag started from, and the slot currently
  // hovered as a drop target (for the highlight).
  const [dragSource, setDragSource] = useState<{ deckIndex: number; slotIndex: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ deckIndex: number; slotIndex: number } | null>(null);

  // Fetch the full card catalog once.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAllCards()
      .then((res) => {
        if (!cancelled) setCatalog(res.cards);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load cards');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the active player's collection whenever the active player changes.
  useEffect(() => {
    if (!activePlayerTag) {
      setOwned([]);
      return;
    }
    let cancelled = false;
    fetchPlayerCollection(activePlayerTag)
      .then((res) => {
        if (!cancelled) setOwned(res.cards);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load collection');
      });
    return () => {
      cancelled = true;
    };
  }, [activePlayerTag]);

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
        // player has unlocked: 0 = neither, >= 1 = evo tier, >= 2 = hero tier.
        // The player API's iconUrls.evolutionMedium appears for every card that
        // CAN evolve (not just owned ones), so it's unreliable as an ownership
        // signal. heroMedium is only returned for owned heroes, so it's still safe.
        hasEvo: (ownedCard?.evolutionLevel ?? 0) >= 1,
        ownsHero: !!ownedCard?.iconUrls?.heroMedium,
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

  // Score the decks on the backend whenever they change, debounced so a flurry
  // of edits sends one request. Empty boards skip the round trip entirely and
  // just clear the scores. We send only the cards actually placed (with the
  // player's levels + owned evo/hero tier) so the server never re-fetches the
  // collection — scoring is reactive without hammering the Clash Royale API.
  useEffect(() => {
    const placedIds = [...usedIds];
    if (placedIds.length === 0) {
      setScores(null);
      return;
    }
    const cards = placedIds
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

    let cancelled = false;
    const timer = setTimeout(() => {
      scoreBuilderDecks(cards, decks)
        .then((res) => {
          if (!cancelled) setScores(res);
        })
        .catch(() => {
          // A failed scoring pass shouldn't surface as a page error — the decks
          // are still fully usable, just unscored until the next change.
          if (!cancelled) setScores(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [decks, cardById, usedIds]);

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
    e.dataTransfer.dropEffect = 'move';
    if (dragOver?.deckIndex !== deckIndex || dragOver?.slotIndex !== slotIndex) {
      setDragOver({ deckIndex, slotIndex });
    }
  };

  const handleDrop = (e: DragEvent, deckIndex: number, slotIndex: number) => {
    e.preventDefault();
    if (!dragSource) return;
    swapSlots(dragSource, { deckIndex, slotIndex });
    setDragSource(null);
    setDragOver(null);
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOver(null);
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

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, borderBottomColor: theme.border }}>
        <div style={styles.titleRow}>
          <h2 style={{ color: theme.text.primary, margin: 0 }}>War Deck Builder</h2>
          {scores && scores.total > 0 && (
            <span
              style={{ ...styles.totalScore, color: theme.text.primary, borderColor: theme.border }}
              title="Sum of all four deck scores. Meta decks (★) are scored exactly like the auto-generated recommendations (win rate × fieldability × how widely they're played); the rest (~) are unproven estimates, dampened to sit below any proven meta deck."
            >
              <span style={{ ...styles.totalScoreLabel, color: theme.text.secondary }}>Total Score</span>
              <span style={{ color: scoreAccent }}>{scores.total.toFixed(3)}</span>
            </span>
          )}
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
                            ...(kind ? slotBorderStyle(kind) : {}),
                            ...(isDropTarget ? styles.slotDropTarget : {}),
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
                              title={`Showing ${activeVersion === 'hero' ? 'Hero' : 'Evolution'} — click to switch`}
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
                          // Fill the interior with the deck surface so an empty
                          // special slot blends in like the plain slots. Must be
                          // a gradient (image) not a bare colour: a colour in
                          // this layer lets the border gradient bleed through,
                          // which is the "blueish inside" of the empty slots.
                          ...(kind
                            ? slotBorderStyle(
                                kind,
                                `linear-gradient(${theme.bg.secondary}, ${theme.bg.secondary})`,
                                false
                              )
                            : {}),
                          ...(isDropTarget ? styles.slotDropTarget : {}),
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
