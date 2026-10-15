import React from 'react';
import type { DeckCardData } from '../api';
import { versionOf, cardIconUrl, displayLevel, avgElixir, orderBySlots, slotVersionOf, inOrder, type CardVersionRef } from '../lib/cardDisplay';
import { classifyDeck, featuredCard } from '../lib/archetypes';
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
  cardOrder?: number[];
  playerScore: number;
  deckNumber: number;
  canSwap?: boolean;
  onSwap?: () => void;
  scoreLabel?: string;
  scoreTooltip?: React.ReactNode;
  priority?: boolean;
  /** Generator only: keep this deck while the others are re-picked around it. */
  locked?: boolean;
  onToggleLock?: () => void;
}

/** One generated deck: a banner named after its win condition, its eight cards, and its actions. */
export default function DeckCard({
  cards,
  metaWinRate,
  uses,
  players,
  pickRate,
  cardVersions,
  metaCardVersions,
  cardOrder,
  playerScore,
  deckNumber,
  canSwap,
  onSwap,
  scoreLabel,
  scoreTooltip,
  priority,
  locked,
  onToggleLock,
}: DeckCardProps) {
  const isMobile = useIsMobile();

  const slotVersion = slotVersionOf(metaCardVersions, cardVersions);

  const orderedCards = cardOrder ? inOrder(cards, cardOrder) : orderBySlots(cards, slotVersion);
  const deckLink = buildDeckLink(orderedCards.map((c) => c.id));
  const archetype = classifyDeck(cards);
  const featured = featuredCard(cards);
  const featuredArt = featured ? cardIconUrl(featured.iconUrls, versionOf(cardVersions, featured.id)) : '';

  return (
    <div
      className="deck-card"
      style={{
        ...styles.container,
        borderColor: locked ? theme.lockedBorder : theme.containerBorder,
        boxShadow: locked ? `0 0 0 1px ${theme.lockedBorder}, ${theme.containerShadow}` : theme.containerShadow,
      }}
    >
      <div style={{ ...styles.banner, padding: isMobile ? '16px 16px 18px' : '18px 24px' }}>
        {/* Art layers are clipped on their own, so the stat tooltips can still overflow the banner. */}
        <div style={styles.bannerArt} aria-hidden="true">
          {featuredArt && <img src={featuredArt} alt="" style={styles.bannerBlur} />}
          <div style={styles.bannerShade} />
          {featuredArt && (
            <img
              src={featuredArt}
              alt=""
              style={{ ...styles.bannerCard, width: isMobile ? '78px' : '108px', right: isMobile ? '14px' : '26px' }}
            />
          )}
        </div>

        <span style={styles.deckNumber}>Deck {deckNumber}</span>
        <h3 style={{ ...styles.name, fontSize: isMobile ? '21px' : '26px', paddingRight: isMobile ? '84px' : '130px' }}>{archetype.name}</h3>

        <div style={{ ...styles.stats, gap: isMobile ? '16px' : '22px', paddingRight: isMobile ? '84px' : '130px' }}>
          <div style={styles.lead}>
            <span style={styles.statLabel}>
              {scoreLabel ?? 'Score'}
              {!isMobile && (
                <InfoTip ariaLabel="How the score is derived" color={theme.bannerMuted} placement="bottom">
                  {scoreTooltip ?? (
                    <>
                      <strong>How well this meta deck fits your collection.</strong>
                      <br />
                      Starts from the deck's win rate among top players, then factors in your card levels (under-leveled cards are penalized), and the Evolutions and Heroes you've unlocked. Win rates are rated cautiously, so a deck with only a few games can't ride a lucky streak.
                    </>
                  )}
                </InfoTip>
              )}
            </span>
            <span style={{ ...styles.leadValue, fontSize: isMobile ? '18px' : '20px' }}>{playerScore.toFixed(3)}</span>
          </div>
          <div style={{ ...styles.rest, gap: isMobile ? '12px' : '16px', fontSize: isMobile ? '13px' : '14px' }}>
            <span style={styles.restStat}>
              <b style={styles.restValue}>{(metaWinRate * 100).toFixed(1)}%</b> win rate
              {!isMobile && (
                <InfoTip ariaLabel="Win rate details" color={theme.bannerMuted} placement="bottom">
                  <strong>Win rate</strong> across {uses} game{uses === 1 ? '' : 's'} played by top war players.
                  <br />
                  Run by {players} player{players === 1 ? '' : 's'} ({(pickRate * 100).toFixed(1)}% pick rate).
                  <br />
                  Ranking uses a confidence-adjusted version of this so small-sample decks don't dominate.
                </InfoTip>
              )}
            </span>
            <span style={styles.restStat}>
              <b style={styles.restValue}>{avgElixir(cards).toFixed(1)}</b> elixir
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? '14px 14px 16px' : '16px 24px 18px' }}>
        <div style={{ ...styles.cards, gap: isMobile ? '10px 8px' : '14px 22px' }}>
          {orderedCards.map((card, index) => (
            <div key={card.id} style={{ minWidth: 0 }} title={`${card.name} · Level ${displayLevel(card.level, card.maxLevel)}/16`}>
              <CardTile
                name={card.name}
                iconUrl={cardIconUrl(card.iconUrls, versionOf(cardVersions, card.id))}
                slotIndex={index}
                elixirCost={card.elixirCost}
                level={displayLevel(card.level, card.maxLevel)}
                nameColor={theme.cardText}
                nameSize={isMobile ? '11.5px' : '12px'}
                nameLines={isMobile ? 2 : 1}
                lazyLoad={!priority}
                fetchPriority={priority ? 'high' : undefined}
              />
            </div>
          ))}
        </div>

        <div className="deck-actions" style={{ ...styles.actions, marginTop: isMobile ? '14px' : '18px' }}>
          <DeckLinkAction
            link={deckLink}
            isMobile={isMobile}
            className="mobile-touch-target"
            style={{ ...styles.action, ...(isMobile ? styles.actionGrow : {}) }}
            label={isMobile ? 'Open in game' : 'Copy deck link'}
          />
          {!isMobile && <span style={{ flex: 1 }} />}
          {onToggleLock && (
            <button
              type="button"
              onClick={onToggleLock}
              aria-pressed={!!locked}
              aria-label={locked ? `Unlock deck ${deckNumber}` : `Lock deck ${deckNumber}`}
              title={locked ? 'Locked: this deck stays when you change options. Click to unlock.' : 'Lock this deck: keep it and re-pick the other decks around it'}
              className="mobile-touch-target"
              style={{ ...styles.action, ...styles.iconAction, ...(locked ? styles.actionOn : {}) }}
            >
              <LockIcon locked={!!locked} />
            </button>
          )}
          {canSwap && (
            <button
              type="button"
              onClick={onSwap}
              aria-label={`Swap deck ${deckNumber}`}
              title="See alternatives for this deck"
              className="mobile-touch-target"
              style={{ ...styles.action, ...(isMobile ? styles.actionGrow : {}) }}
            >
              <SwapArrows />
              Swap deck
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const theme = {
  containerBorder: 'var(--panel-border)',
  containerShadow: 'var(--panel-shadow)',
  cardText: 'var(--text-primary)',
  lockedBorder: 'var(--accent)',
  bannerMuted: 'var(--hero-muted)',
};

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d={locked ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.5-2'} />
    </svg>
  );
}

function SwapArrows() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </svg>
  );
}

const styles = {
  container: {
    minWidth: 0,
    border: '1px solid',
    borderRadius: '18px',
    backgroundColor: 'var(--bg-secondary)',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  },
  banner: {
    position: 'relative' as const,
    isolation: 'isolate' as const,
    minHeight: '112px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    justifyContent: 'flex-end' as const,
    gap: '8px',
    color: 'var(--hero-text)',
  },
  bannerArt: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: -1,
    overflow: 'hidden' as const,
    borderRadius: '17px 17px 0 0',
    backgroundColor: 'var(--hero-bg)',
  },
  bannerBlur: {
    position: 'absolute' as const,
    inset: '-24px',
    width: 'calc(100% + 48px)',
    height: 'calc(100% + 48px)',
    objectFit: 'cover' as const,
    objectPosition: '50% 25%',
    filter: 'var(--hero-art)',
    opacity: 'var(--hero-art-opacity)',
  },
  bannerShade: {
    position: 'absolute' as const,
    inset: 0,
    background: 'var(--hero-fade)',
  },
  bannerCard: {
    position: 'absolute' as const,
    bottom: '-18px',
    borderRadius: '12px',
    transform: 'rotate(6deg)',
    filter: 'var(--hero-card-shadow)',
  },
  deckNumber: {
    fontSize: '13px',
    fontWeight: 500 as const,
    color: theme.bannerMuted,
  },
  name: {
    margin: 0,
    fontWeight: 700 as const,
    letterSpacing: '-0.2px',
    lineHeight: 1.15,
  },
  stats: {
    display: 'flex' as const,
    alignItems: 'flex-end' as const,
    flexWrap: 'wrap' as const,
    rowGap: '8px',
    marginTop: '6px',
  },
  lead: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '5px',
  },
  statLabel: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    fontSize: '12px',
    fontWeight: 500 as const,
    color: theme.bannerMuted,
    whiteSpace: 'nowrap' as const,
  },
  leadValue: {
    fontWeight: 700 as const,
    lineHeight: 1,
    color: 'var(--hero-text)',
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
  rest: {
    display: 'flex' as const,
    paddingBottom: '1px',
    color: theme.bannerMuted,
  },
  restStat: {
    display: 'inline-flex' as const,
    alignItems: 'baseline' as const,
    gap: '4px',
    whiteSpace: 'nowrap' as const,
  },
  restValue: {
    fontWeight: 600 as const,
    color: 'color-mix(in srgb, var(--hero-text) 86%, transparent)',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  cards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    maxWidth: '560px',
    margin: '0 auto',
  },
  actions: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
  },
  action: {
    height: '38px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '7px',
    padding: '0 14px',
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
  },
  actionGrow: {
    flex: 1,
    minWidth: 0,
  },
  iconAction: {
    width: '38px',
    padding: 0,
    flexShrink: 0,
  },
  actionOn: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: 'var(--on-accent)',
  },
};
