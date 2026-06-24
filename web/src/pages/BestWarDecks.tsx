import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { fetchBestDecks, fetchPlayerCollection } from '../api';
import type { BestDecksResponse, BestDeckEntry, BestDeckSet } from '../api';
import { slotKind, slotBorderStyle } from '../slotStyles';

type Card = BestDeckEntry['cards'][0];

function cardVersion(deck: BestDeckEntry, cardId: number): 'normal' | 'evo' | 'hero' {
  return deck.cardVersions?.find(v => v.cardId === cardId)?.version ?? 'normal';
}

function orderedCards(deck: BestDeckEntry): Card[] {
  const ver = (id: number) => cardVersion(deck, id);
  const evoQ = deck.cards.filter(c => ver(c.id) === 'evo').slice();
  const heroQ = deck.cards.filter(c => ver(c.id) === 'hero').slice();
  const norms = deck.cards.filter(c => ver(c.id) === 'normal').slice();

  const slot1 = evoQ.shift();
  const slot2 = heroQ.shift();
  const slot3 = evoQ.shift() ?? heroQ.shift();

  return [slot1, slot2, slot3]
    .map(s => s ?? norms.shift())
    .filter((c): c is Card => c !== undefined)
    .concat(norms, evoQ, heroQ);
}

function cardIcon(card: Card, version: 'normal' | 'evo' | 'hero'): string {
  const { medium, evolutionMedium, heroMedium } = card.iconUrls ?? {};
  if (version === 'hero') return heroMedium || evolutionMedium || medium || '';
  if (version === 'evo') return evolutionMedium || medium || '';
  return medium || '';
}

function CompactDeckRow({
  deck,
  isDarkMode,
  theme,
}: {
  deck: BestDeckEntry;
  isDarkMode: boolean;
  theme: ReturnType<typeof getTheme>;
}) {
  const [showMetaInfo, setShowMetaInfo] = React.useState(false);

  const cards = orderedCards(deck);
  const avgElixir = deck.cards.length
    ? (deck.cards.reduce((s, c) => s + (c.elixirCost ?? 0), 0) / deck.cards.length).toFixed(1)
    : '—';

  const rowBg = isDarkMode ? '#1a1a1e' : '#f8f9ff';
  const rowBorder = isDarkMode ? '#2a2a2e' : '#eceef6';
  const accentColor = isDarkMode ? '#e8b24a' : '#007bff';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '10px 14px',
        backgroundColor: rowBg,
        borderRadius: '12px',
        border: `1px solid ${rowBorder}`,
      }}
    >
      {/* 8-card row */}
      <div style={{ display: 'flex', gap: '5px', flex: 1 }}>
        {cards.map((card, index) => {
          const ver = cardVersion(deck, card.id);
          const icon = cardIcon(card, ver);
          const kind = slotKind(index);
          return (
            <div key={card.id} style={{ flex: 1, minWidth: 0 }} title={card.name}>
              <div
                style={{
                  position: 'relative',
                  aspectRatio: '0.82',
                  borderRadius: '7px',
                  overflow: 'hidden',
                  background: 'linear-gradient(160deg, #2a3a6a 0%, #16213f 100%)',
                  ...(kind
                    ? slotBorderStyle(kind)
                    : { border: '2px solid rgba(0,0,0,0.2)', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }),
                }}
              >
                {icon && (
                  <img
                    src={icon}
                    alt={card.name}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                {/* Elixir drop */}
                {card.elixirCost != null && (
                  <div style={{ position: 'absolute', top: '3px', left: '3px', width: '23px', height: '25px', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
                    <svg viewBox="0 0 28 30" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
                      <defs>
                        <radialGradient id="elixirGradBwd" cx="36%" cy="62%" r="70%">
                          <stop offset="0%" stopColor="#f6a8ff" />
                          <stop offset="45%" stopColor="#d63bd6" />
                          <stop offset="100%" stopColor="#a0149e" />
                        </radialGradient>
                      </defs>
                      <path d="M24 5 Q24 18 22.8 24.9 A12 12 0 0 1 1.7 13.9 Q6 6 24 5 Z" fill="url(#elixirGradBwd)" stroke="#000000" strokeWidth="1.6" />
                      <ellipse cx="9" cy="14" rx="2.4" ry="3.4" fill="rgba(255,255,255,0.55)" transform="rotate(-20 9 14)" />
                    </svg>
                    <span style={{ position: 'absolute', left: 0, right: '8%', top: '60%', transform: 'translateY(-50%)', textAlign: 'center', color: 'white', fontWeight: 'bold', fontSize: '11px', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                      {card.elixirCost}
                    </span>
                  </div>
                )}
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '10px',
                  textAlign: 'center',
                  marginTop: '5px',
                  color: isDarkMode ? '#f4f4f5' : '#000000',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {card.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline stats */}
      <div style={{ display: 'flex', gap: '18px', flexShrink: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={statLabel(theme)}>Win Rate</div>
          <div style={{ ...statValue, color: accentColor }}>{(deck.winRate * 100).toFixed(1)}%</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...statLabel(theme), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            Meta Score
            <span
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '13px',
                height: '13px',
                borderRadius: '50%',
                border: `1px solid ${theme.text.secondary}`,
                fontSize: '8px',
                fontStyle: 'italic',
                fontWeight: 'bold',
                cursor: 'help',
                lineHeight: 1,
                color: theme.text.secondary,
                flexShrink: 0,
              }}
              onMouseEnter={() => setShowMetaInfo(true)}
              onMouseLeave={() => setShowMetaInfo(false)}
            >
              i
              {showMetaInfo && (
                <span style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '210px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${isDarkMode ? '#3a3a3a' : '#1a1a1a'}`,
                  backgroundColor: isDarkMode ? '#000000' : '#1a1a1a',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 'normal',
                  fontStyle: 'normal',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  lineHeight: 1.4,
                  textAlign: 'left',
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  pointerEvents: 'none',
                  whiteSpace: 'normal',
                }}>
                  Confidence-adjusted win rate × popularity weight. Higher means this deck both wins more <em>and</em> is run by more top war players.
                </span>
              )}
            </span>
          </div>
          <div style={{ ...statValue, color: theme.text.primary }}>{deck.metaScore.toFixed(3)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={statLabel(theme)}>Avg Elixir</div>
          <div style={{ ...statValue, color: theme.text.primary }}>{avgElixir}</div>
        </div>
      </div>
    </div>
  );
}

const statLabel = (theme: ReturnType<typeof getTheme>) => ({
  fontSize: '10px',
  fontWeight: 600 as const,
  letterSpacing: '0.4px',
  textTransform: 'uppercase' as const,
  color: theme.text.secondary,
  marginBottom: '3px',
});

const statValue = {
  fontSize: '15px',
  fontWeight: 800 as const,
  lineHeight: 1.1,
};

const BUILDER_DECK_COUNT = 4;
const BUILDER_SLOTS = 8;

export default function BestWarDecks() {
  const { isDarkMode, activePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);
  const navigate = useNavigate();
  const [data, setData] = useState<BestDecksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyingSetIdx, setCopyingSetIdx] = useState<number | null>(null);
  const [hoveredCopyBtn, setHoveredCopyBtn] = useState<number | null>(null);

  useEffect(() => {
    fetchBestDecks()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function copySetToBuilder(set: BestDeckSet, setIdx: number) {
    setCopyingSetIdx(setIdx);
    try {
      // Resolve owned card IDs: try the builder's sessionStorage cache first,
      // then fall back to a fresh fetch. Skip ownership filtering when no player.
      const ownedIds = new Set<number>();
      if (activePlayerTag) {
        const cacheKey = `wdb_owned_${activePlayerTag}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          (JSON.parse(cached) as Array<{ id: number }>).forEach(c => ownedIds.add(c.id));
        } else {
          const res = await fetchPlayerCollection(activePlayerTag);
          res.cards.forEach(c => ownedIds.add(c.id));
          sessionStorage.setItem(cacheKey, JSON.stringify(res.cards));
        }
      }
      const filterByOwnership = activePlayerTag && ownedIds.size > 0;

      // Build 4×8 deck array. Slots follow orderedCards ordering (evo→hero→both→normals).
      const newDecks = Array.from({ length: BUILDER_DECK_COUNT }, (_, deckIdx): (number | null)[] => {
        const deck = set.decks[deckIdx];
        if (!deck) return Array(BUILDER_SLOTS).fill(null);
        const ordered = orderedCards(deck);
        return Array.from({ length: BUILDER_SLOTS }, (__, slotIdx) => {
          const card = ordered[slotIdx];
          if (!card) return null;
          if (filterByOwnership && !ownedIds.has(card.id)) return null;
          return card.id;
        });
      });

      // Set slotVersion for the 'both' slot (index 2) in each deck.
      const newSlotVersion: Record<string, 'evo' | 'hero'> = {};
      set.decks.forEach((deck, deckIdx) => {
        const ordered = orderedCards(deck);
        const spillCard = ordered[2];
        if (spillCard) {
          const ver = cardVersion(deck, spillCard.id);
          if (ver === 'evo' || ver === 'hero') {
            newSlotVersion[`${deckIdx}-2`] = ver;
          }
        }
      });

      sessionStorage.setItem('wdb_decks', JSON.stringify(newDecks));
      sessionStorage.setItem('wdb_slotVersion', JSON.stringify(newSlotVersion));
      sessionStorage.removeItem('wdb_scores');
      navigate('/builder');
    } catch {
      // silently bail — user stays on the page
    } finally {
      setCopyingSetIdx(null);
    }
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 0' }}>
      <div style={{ marginBottom: '30px', paddingBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        <h2 style={{ color: theme.text.primary, margin: 0 }}>Best War Deck Sets</h2>
        <p style={{ fontSize: '15px', margin: '8px 0 0', color: theme.text.secondary }}>
          The strongest 4-deck combinations for war, ranked by meta performance. Assumes all cards are owned, max level, with all evolutions and heroes.
        </p>
      </div>

      {loading && <p style={{ color: theme.text.secondary, marginTop: '32px' }}>Loading best decks…</p>}
      {error && <p style={{ color: '#e05c5c', marginTop: '32px' }}>Failed to load: {error}</p>}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {data.sets.map((set, setIdx) => {
            const medalColor = theme.accent;
            return (
            <section
              key={setIdx}
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: '16px',
                padding: '20px 24px',
                backgroundColor: theme.bg.secondary,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
                paddingBottom: '14px',
                borderBottom: `1px solid ${theme.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span style={{
                    fontSize: '28px',
                    fontWeight: 900,
                    color: medalColor,
                    lineHeight: 1,
                    letterSpacing: '-0.5px',
                  }}>
                    #{setIdx + 1}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: theme.text.secondary,
                    letterSpacing: '0.8px',
                    textTransform: 'uppercase',
                  }}>
                    War Deck Set
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    color: theme.text.secondary,
                    marginBottom: '2px',
                  }}>
                    Total Score
                  </div>
                  <div style={{
                    fontSize: '20px',
                    fontWeight: 800,
                    color: medalColor,
                    lineHeight: 1,
                  }}>
                    {set.totalScore.toFixed(3)}
                  </div>
                </div>
              </div>

              <div style={{ position: 'relative', paddingRight: '60px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {set.decks.map((deck, deckIdx) => (
                    <CompactDeckRow
                      key={deckIdx}
                      deck={deck}
                      isDarkMode={isDarkMode}
                      theme={theme}
                    />
                  ))}
                </div>
                {/* Copy-to-builder icon button, vertically centered on the 4 rows */}
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '52px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => copySetToBuilder(set, setIdx)}
                      disabled={copyingSetIdx !== null}
                      aria-label="Use in Builder"
                      className="deck-swap-btn"
                      onMouseEnter={() => setHoveredCopyBtn(setIdx)}
                      onMouseLeave={() => setHoveredCopyBtn(null)}
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        border: `1px solid ${medalColor}`,
                        backgroundColor: isDarkMode ? '#26262a' : '#ffffff',
                        color: medalColor,
                        cursor: copyingSetIdx !== null ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        boxShadow: '0 3px 10px rgba(13, 27, 62, 0.18)',
                        opacity: copyingSetIdx !== null ? 0.6 : 1,
                      }}
                    >
                      {copyingSetIdx === setIdx ? (
                        /* Spinning dots to indicate in-progress */
                        <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', display: 'block', animation: 'spin 1s linear infinite' }} aria-hidden="true">
                          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" strokeLinecap="round" />
                        </svg>
                      ) : (
                        /* Arrow-into-bracket: "send to builder" */
                        <svg viewBox="0 0 512 512" style={{ width: '20px', height: '20px', display: 'block' }} aria-hidden="true">
                          <path fill="currentColor" d="M217.9 105.9L340.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L217.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1L32 320c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM352 416l64 0c17.7 0 32-14.3 32-32l0-256c0-17.7-14.3-32-32-32l-64 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l64 0c53 0 96 43 96 96l0 256c0 53-43 96-96 96l-64 0c-17.7 0-32-14.3-32-32s14.3-32 32-32z" />
                        </svg>
                      )}
                    </button>
                    {hoveredCopyBtn === setIdx && copyingSetIdx === null && (
                      <div style={{
                        position: 'absolute',
                        right: 'calc(100% + 10px)',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        whiteSpace: 'nowrap',
                        backgroundColor: isDarkMode ? '#000000' : '#1a1a1a',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '6px 10px',
                        borderRadius: '6px',
                        pointerEvents: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        zIndex: 10,
                      }}>
                        Use in Builder
                      </div>
                    )}
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
