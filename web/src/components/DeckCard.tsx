import { useState } from 'react';
import { slotKind, slotBorderStyle } from '../slotStyles';

interface Card {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  elixirCost?: number;
  elixerCost?: number;
  evolutionLevel?: number;
  iconUrls?: {
    medium?: string;
    evolutionMedium?: string;
    heroMedium?: string;
  };
}

interface CardVersionRef {
  cardId: number;
  version: 'normal' | 'evo' | 'hero';
}

interface DeckCardProps {
  cards: Card[];
  metaWinRate: number;
  confidence: number;
  uses: number;
  players: number;
  pickRate: number;
  cardVersions?: CardVersionRef[];
  metaCardVersions?: CardVersionRef[];
  playerScore: number;
  deckNumber: number;
  isDarkMode: boolean;
  // Swap control. When more than one valid option exists for this slot, the
  // header shows a "Swap" button that opens a picker of alternative decks.
  canSwap?: boolean;
  onSwap?: () => void;
}

export default function DeckCard({
  cards,
  metaWinRate,
  confidence,
  uses,
  players,
  pickRate,
  cardVersions,
  metaCardVersions,
  playerScore,
  deckNumber,
  isDarkMode,
  canSwap,
  onSwap,
}: DeckCardProps) {
  const [showWinRateInfo, setShowWinRateInfo] = useState(false);
  const [showPlayerScoreInfo, setShowPlayerScoreInfo] = useState(false);

  const getDisplayLevel = (card: Card) => {
    const offset = 16 - card.maxLevel;
    return card.level + offset;
  };

  // Two different version signals, used for two different things:
  //
  // slotVersion — what the top players fielded (raw meta, legal-capped). Drives
  // which positional evo/hero slot a card lands in, so e.g. a meta Hero Giant
  // sits in the hero slot even when this player hasn't unlocked it.
  //
  // displayVersion — personalised to the player (unowned specials downgraded to
  // normal). Drives the artwork, so we show the version they'd actually field.
  const slotVersion = (cardId: number): 'normal' | 'evo' | 'hero' =>
    metaCardVersions?.find(v => v.cardId === cardId)?.version
    ?? cardVersions?.find(v => v.cardId === cardId)?.version
    ?? 'normal';

  const displayVersion = (cardId: number): 'normal' | 'evo' | 'hero' =>
    cardVersions?.find(v => v.cardId === cardId)?.version ?? 'normal';

  const getCardIcon = (card: Card): string => {
    const { medium, evolutionMedium, heroMedium } = card.iconUrls || {};
    // Show the art for the version this player would actually field, falling
    // back gracefully if that specific artwork isn't available.
    const version = displayVersion(card.id);
    if (version === 'hero') {
      return heroMedium || evolutionMedium || medium || '';
    }
    if (version === 'evo') {
      return evolutionMedium || medium || '';
    }
    return medium || '';
  };

  const theme = {
    // Container sits one level above the page; the stats strip is recessed one
    // level below it (a darker well) so the card reads as a layered object.
    containerBg: isDarkMode ? '#161618' : '#ffffff',
    containerBorder: isDarkMode ? '#2a2a2e' : '#e8ecf5',
    containerShadow: isDarkMode
      ? '0 8px 24px rgba(0, 0, 0, 0.45)'
      : '0 6px 20px rgba(13, 27, 62, 0.06)',
    headerText: isDarkMode ? '#f4f4f5' : '#0d1b3e',
    // Archetype chip: a quiet filled pill, not a loud outline — keeps gold reserved.
    badgeBg: isDarkMode ? '#26262a' : '#f0f3ff',
    badgeText: isDarkMode ? '#c4c4cc' : '#3a6ea5',
    badgeBorder: isDarkMode ? '#34343a' : '#dbe4f5',
    statsBg: isDarkMode ? '#101012' : '#f8f9ff',
    statsBorder: isDarkMode ? '#2a2a2e' : '#eceef6',
    statsLabel: isDarkMode ? '#8a8a93' : '#6b7280',
    // Secondary metrics stay neutral; the headline (win rate) gets the accent.
    statsValue: isDarkMode ? '#f4f4f5' : '#0d1b3e',
    statsValueAccent: isDarkMode ? '#e8b24a' : '#007bff',
    tooltipBg: isDarkMode ? '#000000' : '#1a1a1a',
    tooltipText: '#ffffff',
    tooltipBorder: isDarkMode ? '#3a3a3a' : '#1a1a1a',
    cardBg: isDarkMode ? '#1e1e1e' : '#f8f9ff',
    cardBorder: isDarkMode ? '#2c2c2c' : '#e0e0e0',
    cardText: isDarkMode ? '#f4f4f5' : '#000000',
    swapBg: isDarkMode ? '#26262a' : '#ffffff',
    swapIcon: isDarkMode ? '#f4f4f5' : '#007bff',
    divider: isDarkMode ? '#2a2a2e' : '#eceef6',
  };

  const elixirOf = (c: Card) => (c.elixirCost ?? c.elixerCost) ?? 0;

  const avgElixirNum = cards.length > 0
    ? cards.reduce((sum, c) => sum + elixirOf(c), 0) / cards.length
    : 0;
  const avgElixir = avgElixirNum.toFixed(1);

  // At-a-glance archetype flavor. A deliberately simple heuristic — a heavy tank
  // win condition with high average elixir reads as Beatdown, a very cheap deck
  // as Cycle, everything else as Control. Not a strict taxonomy (no Bait/Bridge
  // Spam split), just a quick descriptor.
  const BEATDOWN_TANKS = ['Golem', 'Lava Hound', 'Electro Giant', 'Giant', 'Goblin Giant'];
  const hasBeatdownTank = cards.some(c => BEATDOWN_TANKS.includes(c.name));
  const archetype = hasBeatdownTank && avgElixirNum >= 3.8
    ? 'Beatdown'
    : avgElixirNum <= 3.2
      ? 'Cycle'
      : 'Control';

  // Order the cards like the in-game evolution slots, which are positional: slot
  // 1 holds an evolution, slot 2 the champion (hero), slot 3 whichever special is
  // left. Each slot only accepts its own type — a lone champion stays in slot 2
  // rather than sliding into the evo-only slot 1. Empty special slots are filled
  // by normal cards so the grid stays gapless (just like fielding a regular card
  // in an unused evo slot in-game). The slot's colour-coded border (set below by
  // positional index) advertises what that slot can field, the same as the builder.
  const evoQueue = cards.filter(c => slotVersion(c.id) === 'evo');
  const heroQueue = cards.filter(c => slotVersion(c.id) === 'hero');
  const normals = cards.filter(c => slotVersion(c.id) === 'normal');

  const slot1 = evoQueue.shift();                        // evo only
  const slot2 = heroQueue.shift();                       // hero only
  const slot3 = evoQueue.shift() ?? heroQueue.shift();   // remaining special

  const orderedCards = [slot1, slot2, slot3]
    .map(slot => slot ?? normals.shift())                // fill empty slots with normals
    .filter((c): c is Card => c !== undefined)
    .concat(normals, evoQueue, heroQueue);               // rest, plus any defensive leftovers

  return (
    <div className="deck-card" style={{ ...styles.container, backgroundColor: theme.containerBg, borderColor: theme.containerBorder, boxShadow: theme.containerShadow }}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h3 style={{ ...styles.headerTitle, color: theme.headerText }}>Deck {deckNumber}</h3>
        </div>
        <span style={{ ...styles.archetypeBadge, backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder, color: theme.badgeText }}>
          {archetype}
        </span>
      </div>

      <div style={{ ...styles.stats, backgroundColor: theme.statsBg, borderColor: theme.statsBorder }}>
        <div style={{ ...styles.stat, position: 'relative' as const }}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>
            Win Rate
            <span
              style={{ ...styles.infoIcon, borderColor: theme.statsLabel, color: theme.statsLabel }}
              onMouseEnter={() => setShowWinRateInfo(true)}
              onMouseLeave={() => setShowWinRateInfo(false)}
              role="img"
              aria-label="Win rate details"
            >
              i
              {showWinRateInfo && (
                <span style={{ ...styles.tooltip, backgroundColor: theme.tooltipBg, color: theme.tooltipText, borderColor: theme.tooltipBorder }}>
                  <strong>Win rate</strong> across {uses} game{uses === 1 ? '' : 's'} played by top war players.
                  <br />
                  Run by {players} player{players === 1 ? '' : 's'} ({(pickRate * 100).toFixed(1)}% pick rate).
                  <br />
                  Ranking uses a confidence-adjusted version of this so small-sample decks don't dominate.
                </span>
              )}
            </span>
          </span>
          <span style={{ ...styles.statValue, color: theme.statsValueAccent }}>{(metaWinRate * 100).toFixed(1)}%</span>
          <span style={{ ...styles.statSubtext, color: theme.statsLabel }}>{uses} game{uses === 1 ? '' : 's'}</span>
        </div>
        <div style={{ ...styles.stat, borderLeft: `1px solid ${theme.divider}`, position: 'relative' as const }}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>
            Player Score
            <span
              style={{ ...styles.infoIcon, borderColor: theme.statsLabel, color: theme.statsLabel }}
              onMouseEnter={() => setShowPlayerScoreInfo(true)}
              onMouseLeave={() => setShowPlayerScoreInfo(false)}
              role="img"
              aria-label="How the player score is derived"
            >
              i
              {showPlayerScoreInfo && (
                <span style={{ ...styles.tooltip, backgroundColor: theme.tooltipBg, color: theme.tooltipText, borderColor: theme.tooltipBorder }}>
                  <strong>How well this meta deck fits your collection.</strong>
                  <br />
                  Confidence-adjusted win rate × your card levels × evolutions/heroes you've unlocked. Only decks a meaningful number of top players run are shown.
                </span>
              )}
            </span>
          </span>
          <span style={{ ...styles.statValue, color: theme.statsValue }}>{playerScore.toFixed(3)}</span>
        </div>
        <div style={{ ...styles.stat, borderLeft: `1px solid ${theme.divider}` }}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>Avg Elixir</span>
          <span style={{ ...styles.statValue, color: theme.statsValue }}>{avgElixir}</span>
        </div>
      </div>

      <div style={styles.cardsRow}>
        <div style={styles.cards}>
          {orderedCards.map((card, index) => {
            const iconUrl = getCardIcon(card);
            // Frame the first three positions as the evo / hero / either slots.
            const kind = slotKind(index);
            return (
              <div
                key={card.id}
                style={styles.cardLink}
                title={`${card.name} · Level ${getDisplayLevel(card)}/16`}
              >
                <div
                  style={{
                    ...styles.card,
                    backgroundColor: theme.cardBg,
                    // On special slots, slotBorderStyle draws a transparent
                    // border + a gradient via background border-box. A
                    // `borderColor` longhand here would be emitted after the
                    // `border` shorthand and override that transparent border
                    // with solid grey — hiding the gradient ring and leaving
                    // only the glow. So set the neutral border colour on normal
                    // slots only.
                    ...(kind
                      ? slotBorderStyle(kind)
                      : { borderColor: theme.cardBorder }),
                  }}
                >
                  {iconUrl && (
                    <img
                      src={iconUrl}
                      alt={card.name}
                      style={styles.cardImage}
                    />
                  )}
                  <div style={styles.cardElixir}>
                    <svg viewBox="0 0 28 30" style={styles.cardElixirDrop} aria-hidden="true">
                      <defs>
                        <radialGradient id="elixirGrad" cx="36%" cy="62%" r="70%">
                          <stop offset="0%" stopColor="#f6a8ff" />
                          <stop offset="45%" stopColor="#d63bd6" />
                          <stop offset="100%" stopColor="#a0149e" />
                        </radialGradient>
                      </defs>
                      <path
                        d="M24 5 Q24 18 22.8 24.9 A12 12 0 0 1 1.7 13.9 Q6 6 24 5 Z"
                        fill="url(#elixirGrad)"
                        stroke="#000000"
                        strokeWidth="1.6"
                      />
                      <ellipse cx="9" cy="14" rx="2.4" ry="3.4" fill="rgba(255,255,255,0.55)" transform="rotate(-20 9 14)" />
                    </svg>
                    <span style={styles.cardElixirText}>{card.elixirCost || card.elixerCost}</span>
                  </div>
                  <div style={styles.cardLevel}>LEVEL {getDisplayLevel(card)}</div>
                </div>
                <div style={{ ...styles.cardName, color: theme.cardText }}>{card.name}</div>
              </div>
            );
          })}
        </div>
        {canSwap && (
          <button
            type="button"
            onClick={onSwap}
            aria-label={`Swap deck ${deckNumber}`}
            title="See alternatives for this deck"
            className="deck-swap-btn"
            style={{ ...styles.swapButton, backgroundColor: theme.swapBg, color: theme.swapIcon, borderColor: theme.divider }}
          >
            <svg viewBox="0 0 512 512" style={styles.swapIcon} aria-hidden="true">
              <path
                fill="currentColor"
                d="M32 96l320 0 0-64c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l96 96c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-96 96c-9.2 9.2-22.9 11.9-34.9 6.9s-19.8-16.6-19.8-29.6l0-64L32 160c-17.7 0-32-14.3-32-32s14.3-32 32-32zM480 416l-320 0 0 64c0 12.9-7.8 24.6-19.8 29.6s-25.7 2.2-34.9-6.9l-96-96c-6-6-9.4-14.1-9.4-22.6s3.4-16.6 9.4-22.6l96-96c9.2-9.2 22.9-11.9 34.9-6.9s19.8 16.6 19.8 29.6l0 64 320 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    border: '1px solid #e8ecf5',
    borderRadius: '18px',
    padding: '24px',
    backgroundColor: '#ffffff',
    boxShadow: '0 6px 20px rgba(13, 27, 62, 0.06)',
  },
  header: {
    marginBottom: '18px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
  },
  headerLeft: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
  },
  headerTitle: {
    margin: 0,
    fontSize: '19px',
    fontWeight: 700 as const,
    letterSpacing: '0.2px',
  },
  cardsRow: {
    position: 'relative' as const,
  },
  swapButton: {
    position: 'absolute' as const,
    right: '8px',
    top: '50%',
    marginTop: '-22px',
    width: '44px',
    height: '44px',
    border: '1px solid',
    borderRadius: '50%',
    color: 'white',
    cursor: 'pointer',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 0,
    boxShadow: '0 3px 10px rgba(13, 27, 62, 0.18)',
  },
  swapIcon: {
    width: '20px',
    height: '20px',
    display: 'block',
  },
  archetypeBadge: {
    fontSize: '12px',
    fontWeight: 700 as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    padding: '4px 10px',
    borderRadius: '999px',
    border: '1.5px solid',
  },
  stats: {
    display: 'flex' as const,
    justifyContent: 'space-around',
    marginBottom: '24px',
    // Extra bottom padding leaves breathing room for the absolutely-positioned
    // games count that hangs below the win-rate value.
    padding: '14px 10px 26px',
    backgroundColor: '#f8f9ff',
    border: '1px solid #eceef6',
    borderRadius: '12px',
    gap: '8px',
  },
  stat: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  statLabel: {
    fontSize: '11px',
    color: '#666',
    marginBottom: '6px',
    fontWeight: 600 as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
  },
  infoIcon: {
    position: 'relative' as const,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: '1px solid #666',
    fontSize: '9px',
    fontStyle: 'italic' as const,
    fontWeight: 'bold' as const,
    cursor: 'help',
    lineHeight: 1,
  },
  tooltip: {
    position: 'absolute' as const,
    bottom: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '220px',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '11px',
    fontWeight: 'normal' as const,
    fontStyle: 'normal' as const,
    textTransform: 'none' as const,
    letterSpacing: 'normal' as const,
    lineHeight: 1.4,
    textAlign: 'left' as const,
    zIndex: 10,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    pointerEvents: 'none' as const,
  },
  statValue: {
    fontSize: '22px',
    fontWeight: 800 as const,
    color: '#007bff',
    lineHeight: 1.1,
  },
  statSubtext: {
    fontSize: '11px',
    color: '#666',
    // Taken out of flow so the games count sits under the win-rate value
    // without adding height to the stats row — keeps all three values aligned.
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    right: 0,
    textAlign: 'center' as const,
    marginTop: '1px',
  },
  cards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '22px',
    maxWidth: '560px',
    margin: '0 auto',
  },
  cardLink: {
    display: 'block',
  },
  card: {
    position: 'relative' as const,
    aspectRatio: '0.82',
    borderRadius: '10px',
    overflow: 'hidden' as const,
    border: '2px solid rgba(0, 0, 0, 0.15)',
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.25)',
    background: 'linear-gradient(160deg, #2a3a6a 0%, #16213f 100%)',
  },
  cardImage: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  cardElixir: {
    position: 'absolute' as const,
    top: '3px',
    left: '3px',
    width: '23px',
    height: '25px',
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
  },
  cardElixirDrop: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
  },
  cardElixirText: {
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
  cardLevel: {
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
  cardName: {
    fontWeight: '600' as const,
    fontSize: '10px',
    textAlign: 'center' as const,
    marginTop: '5px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
};
