import { useState, useEffect, useMemo } from 'react';
import CardPicker, { type BuilderCard } from '../components/CardPicker';
import {
  fetchAllCards,
  fetchPlayerCollection,
  type CatalogCard,
  type OwnedCard,
} from '../api';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { slotKind, slotBorderStyle } from '../slotStyles';

const DECK_COUNT = 4;
const SLOTS_PER_DECK = 8;

type DeckState = (number | null)[][];

const emptyDecks = (): DeckState =>
  Array.from({ length: DECK_COUNT }, () =>
    Array.from({ length: SLOTS_PER_DECK }, () => null)
  );

export default function WarDeckBuilder() {
  const { isDarkMode, activePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);

  const [catalog, setCatalog] = useState<CatalogCard[]>([]);
  const [owned, setOwned] = useState<OwnedCard[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [decks, setDecks] = useState<DeckState>(emptyDecks);
  const [picker, setPicker] = useState<{ deckIndex: number; slotIndex: number } | null>(null);

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
        // Tiers the player actually OWNS, from evolutionLevel (>= 1 evo, >= 2
        // hero) — matching how the backend detects ownership. Drives whether we
        // swap in the special art; the icon merely existing is not ownership.
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

  const setSlot = (deckIndex: number, slotIndex: number, value: number | null) => {
    setDecks((prev) =>
      prev.map((deck, di) =>
        di === deckIndex ? deck.map((id, si) => (si === slotIndex ? value : id)) : deck
      )
    );
  };

  const handleSelectCard = (cardId: number) => {
    if (!picker) return;
    setSlot(picker.deckIndex, picker.slotIndex, cardId);
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

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, borderBottomColor: theme.border }}>
        <h2 style={{ color: theme.text.primary, margin: 0 }}>War Deck Builder</h2>
        <p style={{ ...styles.subtitle, color: theme.text.secondary, marginTop: '8px' }}>
          Each card can be used once across all four decks. Click a slot to choose a card; click a filled card to remove it.
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
            <h3 style={{ ...styles.deckTitle, color: theme.text.primary }}>Deck {deckIndex + 1}</h3>
            <div style={styles.slotGrid}>
              {deck.map((cardId, slotIndex) => {
                const card = cardId != null ? cardById.get(cardId) : null;
                const displayLevel =
                  card && card.level != null
                    ? card.level + (16 - (card.maxLevel ?? 16))
                    : null;
                // The first three positions are the evo / hero / either slots.
                const kind = slotKind(slotIndex);
                return (
                  <button
                    key={slotIndex}
                    onClick={() => handleSlotClick(deckIndex, slotIndex)}
                    style={styles.slot}
                    title={
                      card
                        ? `${card.name}${displayLevel != null ? ` · Level ${displayLevel}/16` : ''} (click to remove)`
                        : 'Click to add a card'
                    }
                  >
                    {card ? (
                      <>
                        <div style={{ ...styles.slotCard, ...(kind ? slotBorderStyle(kind) : {}) }}>
                          {card.iconUrls?.medium && (
                            <img src={card.iconUrls.medium} alt={card.name} style={styles.slotImage} />
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
                        <div style={{ ...styles.slotName, color: theme.text.primary }}>
                          {card.name}
                        </div>
                      </>
                    ) : (
                      <div style={{ ...styles.slotEmpty, ...(kind ? slotBorderStyle(kind, 'transparent') : {}) }}>
                        <span style={{ ...styles.plus, color: theme.text.secondary }}>+</span>
                      </div>
                    )}
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
  deckTitle: {
    marginTop: 0,
    marginBottom: '16px',
    fontSize: '16px',
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
