import React from 'react';
import type { DeckCardData } from '../api';
import { versionOf, cardIconUrl, displayLevel, avgElixir, deckArchetype, orderBySlots, type CardVersionRef } from '../lib/cardDisplay';
import { buildDeckLink } from '../lib/deckLink';
import { useIsMobile } from '../hooks/useIsMobile';
import CardTile from './CardTile';
import InfoTip from './InfoTip';

interface DeckCardProps {
  cards: DeckCardData[];
  metaWinRate: number;
  uses: number;
  players: number;
  pickRate: number;
  cardVersions?: CardVersionRef[];
  metaCardVersions?: CardVersionRef[];
  playerScore: number;
  deckNumber: number;
  isDarkMode: boolean;
  // When more than one valid option exists for this slot, show a Swap button.
  canSwap?: boolean;
  onSwap?: () => void;
  scoreLabel?: string;
  scoreTooltip?: React.ReactNode;
}

export default function DeckCard({
  cards,
  metaWinRate,
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
  scoreLabel,
  scoreTooltip,
}: DeckCardProps) {
  const isMobile = useIsMobile();

  // Two version signals: the meta versions (what top players fielded) drive
  // which positional slot a card lands in; the personalised versions (unowned
  // specials downgraded) drive the artwork the player would actually field.
  const slotVersion = (cardId: number) =>
    metaCardVersions?.find((v) => v.cardId === cardId)?.version ?? versionOf(cardVersions, cardId);

  const theme = {
    // Container sits one level above the page; the stats strip is recessed one
    // level below it so the card reads as a layered object.
    containerBg: isDarkMode ? '#161618' : '#f6f7f9',
    containerBorder: isDarkMode ? '#2a2a2e' : '#e8ecf5',
    containerShadow: isDarkMode
      ? '0 8px 24px rgba(0, 0, 0, 0.45)'
      : '0 6px 20px rgba(13, 27, 62, 0.06)',
    headerText: isDarkMode ? '#f4f4f5' : '#0d1b3e',
    badgeBg: isDarkMode ? '#26262a' : '#f0f3ff',
    badgeText: isDarkMode ? '#c4c4cc' : '#3a6ea5',
    badgeBorder: isDarkMode ? '#34343a' : '#dbe4f5',
    statsBg: isDarkMode ? '#101012' : '#edeef2',
    statsBorder: isDarkMode ? '#2a2a2e' : '#eceef6',
    statsLabel: isDarkMode ? '#8a8a93' : '#6b7280',
    statsValue: isDarkMode ? '#f4f4f5' : '#0d1b3e',
    statsValueAccent: isDarkMode ? '#e8b24a' : '#007bff',
    cardText: isDarkMode ? '#f4f4f5' : '#000000',
    swapBg: isDarkMode ? '#26262a' : '#f6f7f9',
    swapIcon: isDarkMode ? '#e8b24a' : '#007bff',
    divider: isDarkMode ? '#2a2a2e' : '#eceef6',
    openInGameBg: isDarkMode ? '#26262a' : '#f0f3ff',
    openInGameText: isDarkMode ? '#e8b24a' : '#007bff',
    openInGameBorder: isDarkMode ? '#34343a' : '#dbe4f5',
  };

  const orderedCards = orderBySlots(cards, slotVersion);

  return (
    <div className="deck-card" style={{ ...styles.container, padding: isMobile ? '16px' : '24px', backgroundColor: theme.containerBg, borderColor: theme.containerBorder, boxShadow: theme.containerShadow }}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h3 style={{ ...styles.headerTitle, color: theme.headerText }}>Deck {deckNumber}</h3>
          <a
            href={buildDeckLink(orderedCards.map((c) => c.id))}
            target="_blank"
            rel="noopener noreferrer"
            className="deck-swap-btn"
            title="Open this deck in Clash Royale"
            style={{ ...styles.openInGame, backgroundColor: theme.openInGameBg, color: theme.openInGameText, borderColor: theme.openInGameBorder }}
          >
            <svg viewBox="0 0 24 24" style={styles.openInGameIcon} aria-hidden="true">
              <path fill="currentColor" d="M8 5v14l11-7z" />
            </svg>
            Open in game
          </a>
        </div>
        <span style={{ ...styles.archetypeBadge, backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder, color: theme.badgeText }}>
          {deckArchetype(cards)}
        </span>
      </div>

      <div style={{ ...styles.stats, backgroundColor: theme.statsBg, borderColor: theme.statsBorder }}>
        <div style={{ ...styles.stat, position: 'relative' as const }}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>
            Win Rate
            <InfoTip isDarkMode={isDarkMode} ariaLabel="Win rate details" color={theme.statsLabel}>
              <strong>Win rate</strong> across {uses} game{uses === 1 ? '' : 's'} played by top war players.
              <br />
              Run by {players} player{players === 1 ? '' : 's'} ({(pickRate * 100).toFixed(1)}% pick rate).
              <br />
              Ranking uses a confidence-adjusted version of this so small-sample decks don't dominate.
            </InfoTip>
          </span>
          <span style={{ ...styles.statValue, color: theme.statsValueAccent }}>{(metaWinRate * 100).toFixed(1)}%</span>
          <span style={{ ...styles.statSubtext, color: theme.statsLabel }}>{uses} game{uses === 1 ? '' : 's'}</span>
        </div>
        <div style={{ ...styles.stat, borderLeft: `1px solid ${theme.divider}`, position: 'relative' as const }}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>
            {scoreLabel ?? 'Player Score'}
            <InfoTip isDarkMode={isDarkMode} ariaLabel="How the score is derived" color={theme.statsLabel}>
              {scoreTooltip ?? (
                <>
                  <strong>How well this meta deck fits your collection.</strong>
                  <br />
                  Confidence-adjusted win rate × your card levels × evolutions/heroes you've unlocked. Only decks a meaningful number of top players run are shown.
                </>
              )}
            </InfoTip>
          </span>
          <span style={{ ...styles.statValue, color: theme.statsValue }}>{playerScore.toFixed(3)}</span>
        </div>
        <div style={{ ...styles.stat, borderLeft: `1px solid ${theme.divider}` }}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>Avg Elixir</span>
          <span style={{ ...styles.statValue, color: theme.statsValue }}>{avgElixir(cards).toFixed(1)}</span>
        </div>
      </div>

      <div style={styles.cardsRow}>
        <div style={{ ...styles.cards, gap: isMobile ? '10px 8px' : '22px' }}>
          {orderedCards.map((card, index) => (
            <div key={card.id} title={`${card.name} · Level ${displayLevel(card.level, card.maxLevel)}/16`}>
              <CardTile
                name={card.name}
                iconUrl={cardIconUrl(card.iconUrls, versionOf(cardVersions, card.id))}
                isDarkMode={isDarkMode}
                slotIndex={index}
                elixirCost={card.elixirCost}
                level={displayLevel(card.level, card.maxLevel)}
                nameColor={theme.cardText}
              />
            </div>
          ))}
        </div>
        {/* Desktop: a floating circle beside the cards; on phones it becomes a
            full-width button below so it never overlaps the full-width grid. */}
        {canSwap && !isMobile && (
          <button
            type="button"
            onClick={onSwap}
            aria-label={`Swap deck ${deckNumber}`}
            title="See alternatives for this deck"
            className="deck-swap-btn"
            style={{ ...styles.swapButton, backgroundColor: theme.swapBg, color: theme.swapIcon, borderColor: theme.divider }}
          >
            <SwapArrows style={styles.swapIcon} />
          </button>
        )}
      </div>
      {canSwap && isMobile && (
        <button
          type="button"
          onClick={onSwap}
          aria-label={`Swap deck ${deckNumber}`}
          style={{ ...styles.swapButtonMobile, backgroundColor: theme.swapBg, color: theme.swapIcon, borderColor: theme.divider }}
        >
          <SwapArrows style={styles.swapIconMobile} />
          Swap this deck
        </button>
      )}
    </div>
  );
}

function SwapArrows({ style }: { style: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 512 512" style={style} aria-hidden="true">
      <path
        fill="currentColor"
        d="M32 96l320 0 0-64c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l96 96c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-96 96c-9.2 9.2-22.9 11.9-34.9 6.9s-19.8-16.6-19.8-29.6l0-64L32 160c-17.7 0-32-14.3-32-32s14.3-32 32-32zM480 416l-320 0 0 64c0 12.9-7.8 24.6-19.8 29.6s-25.7 2.2-34.9-6.9l-96-96c-6-6-9.4-14.1-9.4-22.6s3.4-16.6 9.4-22.6l96-96c9.2-9.2 22.9-11.9 34.9-6.9s19.8 16.6 19.8 29.6l0 64 320 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"
      />
    </svg>
  );
}

const styles = {
  container: {
    border: '1px solid',
    borderRadius: '18px',
  },
  header: {
    marginBottom: '18px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexWrap: 'wrap' as const,
    gap: '10px 12px',
  },
  headerLeft: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
  },
  openInGame: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    padding: '5px 12px',
    borderRadius: '999px',
    border: '1px solid',
    fontSize: '11px',
    fontWeight: 700 as const,
    letterSpacing: '0.3px',
    textDecoration: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    // 1px nudge down to optically balance against the title's cap height.
    marginTop: '2px',
  },
  openInGameIcon: {
    width: '12px',
    height: '12px',
    display: 'block',
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
  swapButtonMobile: {
    width: '100%',
    marginTop: '14px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    padding: '11px',
    border: '1px solid',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 700 as const,
    cursor: 'pointer',
  },
  swapIconMobile: {
    width: '15px',
    height: '15px',
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
    // Extra bottom padding leaves room for the games count hanging below the
    // win-rate value.
    padding: '14px 10px 26px',
    border: '1px solid',
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
    marginBottom: '6px',
    fontWeight: 600 as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
  },
  statValue: {
    fontSize: '22px',
    fontWeight: 800 as const,
    lineHeight: 1.1,
  },
  statSubtext: {
    fontSize: '11px',
    // Out of flow so the games count doesn't add height to the stats row.
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
    maxWidth: '560px',
    margin: '0 auto',
  },
};
