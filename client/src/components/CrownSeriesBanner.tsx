import type { ReactNode } from 'react';
import { featuredCard } from '../lib/archetypes';
import { cardIconUrl, versionOf, type CardIconUrls, type CardVersionRef } from '../lib/cardDisplay';
import { CROWN_SERIES_LOGO, LEAGUES, type CrownSeriesLeague } from '../lib/crownSeries';
import InfoTip from './InfoTip';

interface BannerDeck {
  cards: Array<{ id: number; name: string; elixirCost?: number; iconUrls?: CardIconUrls }>;
  cardVersions?: CardVersionRef[];
}

interface CrownSeriesBannerProps {
  league: CrownSeriesLeague;
  playerName: string;
  decks: BannerDeck[];
  total: { value: string; label: string };
  scoreTip: ReactNode;
  isMobile: boolean;
}

/** The player's league on the path from Dagger to King's, above their name and expected round wins. */
export default function CrownSeriesBanner({ league, playerName, decks, total, scoreTip, isMobile }: CrownSeriesBannerProps) {
  const at = LEAGUES.findIndex((l) => l.id === league.id);
  const reached = `${(at / (LEAGUES.length - 1)) * 100}%`;
  const art = decks
    .map((deck) => {
      const card = featuredCard(deck.cards);
      return card ? cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id)) : '';
    })
    .filter(Boolean);
  const middle = (art.length - 1) / 2;
  const step = isMobile ? 24 : 40;
  const current = isMobile ? 52 : 76;

  return (
    <section
      style={{
        ...styles.banner,
        padding: isMobile ? '14px 14px 16px' : '18px 24px 22px',
        marginBottom: isMobile ? '16px' : '24px',
        borderColor: `color-mix(in srgb, ${league.color} 45%, transparent)`,
      }}
    >
      {/* Clipped on its own, so the score tooltip can still overflow the banner. */}
      <div
        style={{
          ...styles.backdrop,
          background: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, ${league.color} var(--cs-top), var(--cs-base)) 0%, color-mix(in srgb, ${league.color} var(--cs-bottom), var(--cs-base)) 70%)`,
        }}
        aria-hidden="true"
      />

      <div style={{ position: 'relative', marginBottom: isMobile ? '24px' : '28px' }}>
        <div
          aria-hidden="true"
          style={{
            ...styles.track,
            left: `${step / 2}px`,
            right: `${step / 2}px`,
            background: `linear-gradient(90deg, ${gold} ${reached}, var(--cs-track-off) ${reached})`,
          }}
        />
        <ol aria-label="Crown Series leagues" style={{ ...styles.path, height: `${current}px` }}>
          {LEAGUES.map((l, i) => {
            const isCurrent = i === at;
            return (
              <li key={l.id} aria-current={isCurrent ? 'step' : undefined} style={styles.step}>
                <img
                  src={l.shield}
                  alt={`${l.name} League`}
                  style={{
                    height: `${isCurrent ? current : step}px`,
                    filter: isCurrent
                      ? `drop-shadow(0 0 18px ${l.glow}) drop-shadow(0 6px 10px rgba(0, 0, 0, 0.5))`
                      : i > at
                        ? 'var(--cs-later-filter)'
                        : undefined,
                    opacity: i > at ? 'var(--cs-later-opacity)' : 1,
                  }}
                />
                {isCurrent && (
                  <span
                    aria-hidden="true"
                    style={{
                      ...styles.stepName,
                      ...(i === 0 ? { left: 0 } : i === LEAGUES.length - 1 ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
                    }}
                  >
                    {l.name} League
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div style={styles.foot}>
        <img src={CROWN_SERIES_LOGO} alt="" style={{ ...styles.logo, height: isMobile ? '44px' : '58px' }} />
        <div style={styles.who}>
          <span style={styles.eyebrow}>Crown Series</span>
          <h2 style={{ ...styles.name, fontSize: isMobile ? '23px' : '30px' }}>{playerName}</h2>
          <span style={styles.cap}>Cards up to level {league.levelCap}</span>
          {decks.length > 0 && (
            <div style={styles.lead}>
              <span style={{ ...styles.leadValue, fontSize: isMobile ? '22px' : '26px' }}>{total.value}</span>
              <span style={styles.leadLabel}>
                {total.label}
                <InfoTip ariaLabel="How the expected round wins are derived" color={muted} placement="bottom" interactive={isMobile}>
                  {scoreTip}
                </InfoTip>
              </span>
            </div>
          )}
        </div>
        {!isMobile && art.length > 0 && (
          <div style={{ ...styles.fan, width: `${58 + 44 * (art.length - 1)}px` }} aria-hidden="true">
            {art.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                style={{
                  ...styles.fanCard,
                  left: `${i * 44}px`,
                  transform: `rotate(${(i - middle) * 6}deg) translateY(${Math.abs(i - middle) * 6}px)`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const gold = '#ffc93c';
const muted = 'var(--cs-muted)';

const styles = {
  banner: {
    position: 'relative' as const,
    zIndex: 1,
    isolation: 'isolate' as const,
    borderRadius: '20px',
    border: '1px solid',
    boxShadow: 'var(--banner-shadow)',
    color: 'var(--cs-text)',
  },
  backdrop: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: -1,
    borderRadius: '19px',
  },
  path: {
    position: 'relative' as const,
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  track: {
    position: 'absolute' as const,
    top: 'calc(50% - 2px)',
    height: '4px',
    borderRadius: '4px',
  },
  step: {
    position: 'relative' as const,
    display: 'flex' as const,
    justifyContent: 'center' as const,
  },
  stepName: {
    position: 'absolute' as const,
    top: 'calc(100% + 4px)',
    whiteSpace: 'nowrap' as const,
    fontSize: '13px',
    fontWeight: 800 as const,
    color: 'var(--cs-league-name)',
  },
  foot: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '14px',
  },
  logo: {
    flexShrink: 0,
    filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5))',
  },
  who: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minWidth: 0,
    flex: 1,
  },
  eyebrow: {
    alignSelf: 'flex-start' as const,
    fontSize: '14px',
    fontWeight: 900 as const,
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    background: 'var(--cs-eyebrow)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    filter: 'var(--cs-eyebrow-shadow)',
  },
  name: {
    margin: '2px 0 0',
    fontWeight: 800 as const,
    lineHeight: 1.1,
    overflowWrap: 'anywhere' as const,
  },
  cap: {
    marginTop: '2px',
    fontSize: '13px',
    color: muted,
  },
  lead: {
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginTop: '8px',
  },
  leadValue: {
    fontWeight: 800 as const,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  leadLabel: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
    fontSize: '13px',
    fontWeight: 500 as const,
    color: muted,
  },
  fan: {
    position: 'relative' as const,
    alignSelf: 'flex-end' as const,
    flexShrink: 0,
    height: '96px',
    marginRight: '6px',
  },
  fanCard: {
    position: 'absolute' as const,
    bottom: 0,
    width: '58px',
    borderRadius: '6px',
    transformOrigin: '50% 120%',
    boxShadow: '0 6px 14px rgba(0, 0, 0, 0.45)',
  },
};
