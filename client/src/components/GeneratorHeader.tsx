import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { featuredCard } from '../lib/archetypes';
import { cardIconUrl, versionOf, type CardIconUrls, type CardVersionRef } from '../lib/cardDisplay';
import InfoTip from './InfoTip';

interface BannerDeck {
  cards: Array<{ id: number; name: string; elixirCost?: number; iconUrls?: CardIconUrls }>;
  cardVersions?: CardVersionRef[];
}

interface GeneratorHeaderProps {
  /** The player's name on the generator; left out, the score sits right under the eyebrow. */
  title?: string;
  eyebrow?: ReactNode;
  /** The lineup as shown, swaps included. */
  decks: BannerDeck[];
  totalScore: number;
  /** Replaces the generator's explanation of the total score. */
  scoreTip?: ReactNode;
  /** Actions under the score, e.g. a button. */
  children?: ReactNode;
  style?: CSSProperties;
  /** Makes the whole banner a button that folds the content it controls. */
  toggle?: { expanded: boolean; onToggle: () => void; controls: string; label: string };
  isMobile: boolean;
}

/** The banner above a lineup: its title, the decks' win conditions fanned out, and the total score. */
export default function GeneratorHeader({ title, eyebrow = 'Your war decks', decks, totalScore, scoreTip, children, style, toggle, isMobile }: GeneratorHeaderProps) {
  const art = decks
    .map((deck) => {
      const card = featuredCard(deck.cards);
      return card ? cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id)) : '';
    })
    .filter(Boolean);

  // The win conditions fan out from the middle, like cards held in a hand.
  // A toggle's arrow takes the top right corner, so the fan moves in and, on a phone, tightens.
  const cardWidth = isMobile ? (toggle ? 48 : 52) : 80;
  const step = isMobile ? (toggle ? 26 : 30) : 48;
  const middle = (art.length - 1) / 2;

  return (
    <section
      style={{
        ...styles.banner,
        padding: isMobile ? '16px 16px' : '20px 28px',
        ...(isMobile && !title ? { paddingTop: '40px' } : {}),
        marginBottom: isMobile ? '16px' : '24px',
        ...style,
      }}
    >
      {/* Art layers are clipped on their own, so the score tooltip can still overflow the banner. */}
      <div style={styles.art} aria-hidden="true">
        <div style={{ ...styles.blur, gridTemplateColumns: `repeat(${Math.max(art.length, 1)}, 1fr)` }}>
          {art.map((src, i) => (
            <div key={i} style={{ ...styles.blurTile, backgroundImage: `url("${src}")` }} />
          ))}
        </div>
        <div style={styles.shade} />
        <div
          style={{
            ...styles.fan,
            width: `${cardWidth + step * Math.max(art.length - 1, 0)}px`,
            height: `${cardWidth * 1.7}px`,
            ...(isMobile
              ? { top: toggle ? '12px' : '14px', right: toggle ? '48px' : '-10px', opacity: 0.9 }
              : { bottom: '-30px', right: toggle ? '74px' : '34px' }),
          }}
        >
          {art.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              style={{
                ...styles.fanCard,
                width: `${cardWidth}px`,
                left: `${i * step}px`,
                ...(isMobile ? { top: 0 } : { bottom: 0 }),
                transform: `rotate(${(i - middle) * 8}deg) translateY(${Math.abs(i - middle) * (isMobile ? 5 : 8)}px)`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Stretched over the banner so a click anywhere toggles it; the score tip and actions sit above it. */}
      {toggle && (
        <button
          type="button"
          className="banner-toggle"
          aria-expanded={toggle.expanded}
          aria-controls={toggle.controls}
          aria-label={toggle.label}
          onClick={toggle.onToggle}
          style={styles.toggle}
        >
          <span style={{ ...styles.chevron, ...(isMobile ? { top: '12px', right: '10px', width: '32px', height: '32px' } : {}) }}>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ ...styles.chevronIcon, transform: toggle.expanded ? 'rotate(180deg)' : undefined }}
            >
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      )}

      <span style={styles.eyebrow}>{eyebrow}</span>
      {title && (
        <h2 style={{ ...styles.name, fontSize: isMobile ? '23px' : '30px', paddingRight: isMobile ? '120px' : '280px' }}>
          {title}
        </h2>
      )}

      {decks.length === 0 ? (
        <span style={styles.empty}>No decks fit your options</span>
      ) : (
        <div style={{ ...styles.lead, ...(toggle ? styles.aboveToggle : {}) }}>
          <span style={{ ...styles.leadValue, fontSize: isMobile ? '22px' : '26px' }}>{totalScore.toFixed(3)}</span>
          <span style={styles.leadLabel}>
            total score
            <InfoTip
              ariaLabel="How the total score is derived"
              color={theme.muted}
              placement="bottom"
              interactive={isMobile}
            >
              {scoreTip ?? (
                <>
                  The combined Player Score of your recommended decks.{' '}
                  {isMobile ? (
                    <>
                      See the{' '}
                      <Link to="/faq#player-score" style={styles.tooltipLink}>
                        FAQ
                      </Link>{' '}
                      for how each individual score is calculated.
                    </>
                  ) : (
                    <>See a deck's Player Score tooltip for how each individual score is calculated.</>
                  )}
                </>
              )}
            </InfoTip>
          </span>
        </div>
      )}
      {children && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            ...(toggle ? { ...styles.aboveToggle, alignSelf: isMobile ? 'stretch' : 'flex-start' } : {}),
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

const theme = {
  muted: 'var(--hero-muted)',
};

const styles = {
  banner: {
    position: 'relative' as const,
    zIndex: 1,
    isolation: 'isolate' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    justifyContent: 'flex-end' as const,
    gap: '6px',
    borderRadius: '20px',
    border: '1px solid var(--panel-border)',
    boxShadow: 'var(--banner-shadow)',
    color: 'var(--hero-text)',
  },
  art: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: -1,
    overflow: 'hidden' as const,
    borderRadius: '19px',
    backgroundColor: 'var(--hero-bg)',
  },
  blur: {
    position: 'absolute' as const,
    inset: '-60px',
    display: 'grid' as const,
    filter: 'var(--hero-art)',
    opacity: 'var(--hero-art-opacity)',
  },
  blurTile: {
    backgroundSize: 'cover',
    backgroundPosition: '50% 30%',
  },
  shade: {
    position: 'absolute' as const,
    inset: 0,
    background: 'var(--hero-fade)',
  },
  fan: {
    position: 'absolute' as const,
  },
  fanCard: {
    position: 'absolute' as const,
    borderRadius: '10px',
    transformOrigin: '50% 120%',
    filter: 'var(--hero-card-shadow)',
  },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 500 as const,
    color: theme.muted,
  },
  name: {
    margin: 0,
    fontWeight: 700 as const,
    lineHeight: 1.1,
    overflowWrap: 'anywhere' as const,
    textShadow: 'var(--hero-text-shadow)',
  },
  empty: {
    marginTop: '10px',
    fontSize: '13px',
    color: theme.muted,
  },
  lead: {
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    gap: '8px',
    marginTop: '8px',
  },
  leadValue: {
    fontWeight: 700 as const,
    lineHeight: 1,
    color: 'var(--hero-text)',
    textShadow: 'var(--hero-text-shadow)',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  leadLabel: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
    fontSize: '13px',
    fontWeight: 500 as const,
    color: theme.muted,
  },
  toggle: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 1,
    padding: 0,
    border: 'none',
    borderRadius: '19px',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--hero-text)',
  },
  chevron: {
    position: 'absolute' as const,
    top: '14px',
    right: '14px',
    width: '34px',
    height: '34px',
    display: 'grid' as const,
    placeItems: 'center' as const,
    borderRadius: '50%',
    border: '1px solid color-mix(in srgb, var(--hero-text) 22%, transparent)',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 62%, transparent)',
    backdropFilter: 'blur(10px)',
  },
  chevronIcon: {
    width: '16px',
    height: '16px',
    display: 'block' as const,
    transition: 'transform 0.25s ease',
  },
  aboveToggle: {
    position: 'relative' as const,
    zIndex: 2,
    alignSelf: 'flex-start' as const,
  },
  tooltipLink: {
    color: 'var(--accent-bright)',
    fontWeight: 600 as const,
    textDecoration: 'underline' as const,
  },
};
