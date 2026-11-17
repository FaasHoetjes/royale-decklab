import { useState } from 'react';
import type { UpgradeTarget } from '../lib/crownSeries';
import CardLink from './CardLink';

interface UpgradeFirstProps {
  targets: UpgradeTarget[];
  levelCap: number;
  isMobile: boolean;
}

/** The cards below the league's cap, biggest gains first, so the player knows what to upgrade. */
export default function UpgradeFirst({ targets, levelCap, isMobile }: UpgradeFirstProps) {
  const [expanded, setExpanded] = useState(false);
  const limit = isMobile ? COLLAPSED_MOBILE : COLLAPSED_DESKTOP;
  const fitsInRow = targets.length <= limit + 1;
  const shown = expanded || fitsInRow ? targets : targets.slice(0, limit);
  const hidden = targets.length - shown.length;

  return (
    <section style={{ ...styles.panel, padding: isMobile ? '12px 12px 10px' : '14px 16px 12px' }} aria-labelledby="upgrade-first">
      <div style={styles.head}>
        <span style={styles.icon} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </span>
        <div style={styles.titles}>
          <h2 id="upgrade-first" style={styles.title}>Upgrade first</h2>
          <span style={styles.subtitle}>Best upgrades for this league's Duel Decks, in order</span>
        </div>
        <span style={styles.count}>
          {targets.length} below {levelCap}
        </span>
      </div>

      <ol style={{ ...styles.cards, gap: isMobile ? '8px' : '10px' }}>
        {shown.map((target) => (
          <li key={target.id} style={{ ...styles.card, width: isMobile ? '56px' : '64px' }}>
            <CardLink name={target.name} title={`${target.name} · Level ${target.level}/${levelCap}, in ${decksLabel(target.deckNumbers).toLowerCase()}`}>
              <div style={styles.art}>
                {target.art && <img src={target.art} alt={target.name} loading="lazy" decoding="async" style={styles.image} />}
              </div>
              <div style={styles.levels}>
                {target.level}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
                <span style={styles.cap}>{levelCap}</span>
              </div>
              <div style={styles.decks}>{decksLabel(target.deckNumbers)}</div>
            </CardLink>
          </li>
        ))}
        {hidden > 0 && (
          <li style={{ ...styles.card, width: isMobile ? '56px' : '64px' }}>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={`Show ${hidden} more cards`}
              style={styles.more}
            >
              +{hidden}
            </button>
          </li>
        )}
      </ol>
    </section>
  );
}

const COLLAPSED_DESKTOP = 10;
const COLLAPSED_MOBILE = 4;

const decksLabel = (deckNumbers: number[]) =>
  deckNumbers.length === 1 ? `Deck ${deckNumbers[0]}` : `Decks ${deckNumbers.join(', ')}`;

const styles = {
  panel: {
    marginBottom: '20px',
    border: '1px solid var(--panel-border)',
    borderRadius: '16px',
    backgroundColor: 'var(--bg-secondary)',
    boxShadow: 'var(--panel-shadow)',
  },
  head: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    marginBottom: '12px',
  },
  icon: {
    width: '30px',
    height: '30px',
    flexShrink: 0,
    display: 'grid' as const,
    placeItems: 'center' as const,
    borderRadius: '9px',
    color: 'var(--upgrade-gold)',
    backgroundColor: 'var(--upgrade-gold-soft)',
  },
  titles: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 700 as const,
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  count: {
    marginLeft: 'auto',
    fontSize: '12px',
    fontWeight: 700 as const,
    color: 'var(--text-tertiary)',
    whiteSpace: 'nowrap' as const,
  },
  cards: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  card: {
    flexShrink: 0,
  },
  art: {
    position: 'relative' as const,
    aspectRatio: '0.82',
    borderRadius: '8px',
    overflow: 'hidden' as const,
    backgroundColor: 'var(--bg-tertiary)',
  },
  image: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  levels: {
    display: 'flex' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: '3px',
    marginTop: '5px',
    fontFamily: "'Lilita One', system-ui, -apple-system, sans-serif",
    fontSize: '14px',
    lineHeight: 1,
    color: 'var(--text-tertiary)',
  },
  cap: {
    color: 'var(--upgrade-gold)',
  },
  decks: {
    marginTop: '3px',
    textAlign: 'center' as const,
    fontSize: '10.5px',
    color: 'var(--text-tertiary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  more: {
    width: '100%',
    aspectRatio: '0.82',
    display: 'grid' as const,
    placeItems: 'center' as const,
    borderRadius: '8px',
    border: '1px dashed var(--border)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 700 as const,
    cursor: 'pointer',
  },
};
