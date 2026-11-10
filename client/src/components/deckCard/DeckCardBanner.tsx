import type { DeckCardData } from '../../api';
import { avgElixir } from '../../lib/cardDisplay';
import InfoTip from '../InfoTip';

interface DeckCardBannerProps {
  isMobile: boolean;
  featuredArt: string;
  archetypeName: string;
  deckNumber: number;
  cards: DeckCardData[];
  playerScore: number;
  metaWinRate: number;
  uses: number;
  players: number;
  pickRate: number;
}

const theme = {
  bannerMuted: 'var(--hero-muted)',
};

export default function DeckCardBanner({
  isMobile,
  featuredArt,
  archetypeName,
  deckNumber,
  cards,
  playerScore,
  metaWinRate,
  uses,
  players,
  pickRate,
}: DeckCardBannerProps) {
  return (
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
      <h3 style={{ ...styles.name, fontSize: isMobile ? '21px' : '26px', paddingRight: isMobile ? '84px' : '130px' }}>{archetypeName}</h3>

      <div style={{ ...styles.stats, gap: isMobile ? '16px' : '22px', paddingRight: isMobile ? '84px' : '130px' }}>
        <div style={styles.lead}>
          <span style={styles.statLabel}>
            Score
            {!isMobile && (
              <InfoTip ariaLabel="How the score is derived" color={theme.bannerMuted} placement="bottom">
                <strong>How well this meta deck fits your collection.</strong>
                <br />
                Starts from the deck's win rate among top players, then factors in your card levels (under-leveled cards are penalized), and the Evolutions and Heroes you've unlocked. Win rates are rated cautiously, so a deck with only a few games can't ride a lucky streak.
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
  );
}

const styles = {
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
    clipPath: 'inset(0 round 17px 17px 0 0)',
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
};
