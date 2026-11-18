import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { UpgradeTarget } from '../lib/crownSeries';
import CardLink from './CardLink';
import { TrendingUpIcon } from './navIcons';

interface UpgradeFirstProps {
  targets: UpgradeTarget[];
  levelCap: number;
  isMobile: boolean;
}

/** The cards below the league's cap, biggest gains first, so the player knows what to upgrade. */
export default function UpgradeFirst({ targets, levelCap, isMobile }: UpgradeFirstProps) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLOListElement>(null);
  const rowWidth = useWidth(rowRef);
  const gap = isMobile ? 8 : 10;
  const minTile = isMobile ? MIN_TILE_MOBILE : MIN_TILE_DESKTOP;
  const columns = rowWidth > 0 ? Math.max(2, Math.floor((rowWidth + gap) / (minTile + gap))) : isMobile ? 6 : 11;
  const fitsInRow = targets.length <= columns;
  const shown = expanded || fitsInRow ? targets : targets.slice(0, columns - 1);
  const hidden = targets.length - shown.length;

  return (
    <section style={{ ...styles.panel, padding: isMobile ? '12px 12px 10px' : '14px 16px 12px' }} aria-labelledby="upgrade-first">
      <div style={styles.head}>
        <span style={styles.icon} aria-hidden="true">
          <TrendingUpIcon />
        </span>
        <div style={styles.titles}>
          <h2 id="upgrade-first" style={styles.title}>Upgrade first</h2>
          <span style={styles.subtitle}>Best upgrades for this league's Duel Decks, in order</span>
        </div>
        <span style={styles.count}>
          {targets.length} below {levelCap}
        </span>
      </div>

      <ol ref={rowRef} style={{ ...styles.cards, gap: `${gap}px`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {shown.map((target) => (
          <li key={target.id}>
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
          <li>
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
        {expanded && !fitsInRow && (
          <li>
            <button type="button" onClick={() => setExpanded(false)} aria-label="Show fewer cards" style={styles.more}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 15 6-6 6 6" />
              </svg>
            </button>
          </li>
        )}
      </ol>
    </section>
  );
}

const MIN_TILE_DESKTOP = 64;
const MIN_TILE_MOBILE = 50;

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

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
    display: 'grid' as const,
    margin: 0,
    padding: 0,
    listStyle: 'none',
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
    fontSize: '14px',
    lineHeight: 1,
    color: 'var(--text-secondary)',
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
