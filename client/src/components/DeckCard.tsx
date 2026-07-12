import React from 'react';
import type { DeckCardData } from '../api';
import { versionOf, cardIconUrl, displayLevel, avgElixir, deckArchetype, orderBySlots, type CardVersionRef } from '../lib/cardDisplay';
import { buildDeckLink } from '../lib/deckLink';
import { useIsMobile } from '../hooks/useIsMobile';
import CardTile from './CardTile';
import InfoTip from './InfoTip';
import DeckLinkAction from './DeckLinkAction';

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
  canSwap,
  onSwap,
  scoreLabel,
  scoreTooltip,
}: DeckCardProps) {
  const isMobile = useIsMobile();

  const slotVersion = (cardId: number) => {
    const meta = metaCardVersions?.find((v) => v.cardId === cardId)?.version;
    return meta && meta !== 'normal' ? meta : versionOf(cardVersions, cardId);
  };

  const orderedCards = orderBySlots(cards, slotVersion);
  const deckLink = buildDeckLink(orderedCards.map((c) => c.id));

  return (
    <div className="deck-card" style={{ ...styles.container, padding: isMobile ? '16px' : '24px', backgroundColor: theme.containerBg, borderColor: theme.containerBorder, boxShadow: theme.containerShadow }}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h3 style={{ ...styles.headerTitle, color: theme.headerText }}>Deck {deckNumber}</h3>
          {!isMobile && (
            <DeckLinkAction
              link={deckLink}
              isMobile={false}
              className="deck-swap-btn"
              style={{ ...styles.openInGame, backgroundColor: theme.openInGameBg, color: theme.openInGameText, borderColor: theme.openInGameBorder }}
              label="Copy deck link"
            />
          )}
        </div>
        <span style={{ ...styles.archetypeBadge, backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder, color: theme.badgeText }}>
          {deckArchetype(cards)}
        </span>
      </div>

      <div style={{ ...styles.stats, backgroundColor: theme.statsBg, borderColor: theme.statsBorder }}>
        <div style={{ ...styles.stat, position: 'relative' as const }}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>
            Win Rate
            {!isMobile && (
              <InfoTip ariaLabel="Win rate details" color={theme.statsLabel}>
                <strong>Win rate</strong> across {uses} game{uses === 1 ? '' : 's'} played by top war players.
                <br />
                Run by {players} player{players === 1 ? '' : 's'} ({(pickRate * 100).toFixed(1)}% pick rate).
                <br />
                Ranking uses a confidence-adjusted version of this so small-sample decks don't dominate.
              </InfoTip>
            )}
          </span>
          <span style={{ ...styles.statValue, color: theme.statsValueAccent }}>{(metaWinRate * 100).toFixed(1)}%</span>
          <span style={{ ...styles.statSubtext, color: theme.statsLabel }}>{uses} game{uses === 1 ? '' : 's'}</span>
        </div>
        <div style={{ ...styles.stat, borderLeft: `1px solid ${theme.divider}`, position: 'relative' as const }}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>
            {scoreLabel ?? 'Player Score'}
            {!isMobile && (
              <InfoTip ariaLabel="How the score is derived" color={theme.statsLabel}>
                {scoreTooltip ?? (
                  <>
                    <strong>How well this meta deck fits your collection.</strong>
                    <br />
                    Starts from the deck's win rate among top players, then factors in your card levels (under-leveled cards are penalized), the Evolutions and Heroes you've unlocked, and how widely top players run it.
                  </>
                )}
              </InfoTip>
            )}
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
                slotIndex={index}
                elixirCost={card.elixirCost}
                level={displayLevel(card.level, card.maxLevel)}
                nameColor={theme.cardText}
              />
            </div>
          ))}
        </div>
        {canSwap && !isMobile && (
          <button
            type="button"
            onClick={onSwap}
            aria-label={`Swap deck ${deckNumber}`}
            title="See alternatives for this deck"
            className="deck-swap-btn mobile-touch-target"
            style={{ ...styles.swapButton, backgroundColor: theme.swapBg, color: theme.swapIcon, borderColor: theme.divider }}
          >
            <SwapArrows style={styles.swapIcon} />
          </button>
        )}
      </div>
      {isMobile && (
        <div className="deck-mobile-actions" style={styles.mobileActions}>
          <DeckLinkAction
            link={deckLink}
            isMobile
            className="mobile-touch-target"
            style={{ ...styles.openInGameMobile, backgroundColor: theme.swapBg, color: theme.swapIcon, borderColor: theme.divider }}
            label="Open in Clash Royale"
          />
          {canSwap && (
            <button
              className="mobile-touch-target"
              type="button"
              onClick={onSwap}
              aria-label={`Swap deck ${deckNumber}`}
              style={{ ...styles.swapButtonMobile, backgroundColor: theme.swapBg, color: theme.swapIcon, borderColor: theme.divider }}
            >
              <SwapArrows style={styles.actionIconMobile} />
              Swap deck
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const theme = {
  containerBg: 'var(--bg-secondary)',
  containerBorder: 'var(--panel-border)',
  containerShadow: 'var(--panel-shadow)',
  headerText: 'var(--text-heading)',
  badgeBg: 'var(--archetype-bg)',
  badgeText: 'var(--archetype-text)',
  badgeBorder: 'var(--archetype-border)',
  statsBg: 'var(--inset-bg)',
  statsBorder: 'var(--row-border)',
  statsLabel: 'var(--stat-label)',
  statsValue: 'var(--text-heading)',
  statsValueAccent: 'var(--accent)',
  cardText: 'var(--text-primary)',
  swapBg: 'var(--raised-bg)',
  swapIcon: 'var(--accent)',
  divider: 'var(--row-border)',
  openInGameBg: 'var(--chip-bg)',
  openInGameText: 'var(--accent)',
  openInGameBorder: 'var(--chip-border)',
};

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
    width: '132px',
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
    marginTop: '2px',
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
  mobileActions: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '10px',
    marginTop: '14px',
  },
  openInGameMobile: {
    minWidth: 0,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    padding: '11px 12px',
    border: '1px solid',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 700 as const,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  },
  actionIconMobile: {
    width: '15px',
    height: '15px',
    display: 'block',
    flexShrink: 0,
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
