import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SearchIcon } from './navIcons';

const GHOST_DECKS = ['62%', '58%', '55%', '51%'];

/** Faded stand-in decks behind the prompt, hinting at what a tag unlocks. */
/** @param icon The paths of a 24x24 stroked icon. */
export default function NeedsTag({ isMobile, returnTo, text, icon }: { isMobile: boolean; returnTo: string; text: string; icon: ReactNode }) {
  return (
    <div style={styles.needsTag}>
      <div aria-hidden="true" style={styles.ghost}>
        {GHOST_DECKS.map((winChance) => (
          <div key={winChance} style={{ ...styles.ghostDeck, gap: isMobile ? '5px' : '8px' }}>
            <span style={styles.ghostHeader}>
              <span style={styles.ghostLine} />
              <span style={styles.ghostWinChance}>{winChance}</span>
            </span>
            <span style={{ ...styles.ghostCards, gap: isMobile ? '4px' : '6px' }}>
              {Array.from({ length: 8 }, (_, i) => <span key={i} style={styles.ghostCard} />)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ ...styles.needsTagCard, padding: isMobile ? '24px 18px 20px' : '26px 22px 22px' }}>
        <div style={styles.needsTagIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {icon}
          </svg>
        </div>
        <p style={styles.needsTagText}>{text}</p>
        <Link to="/" state={{ returnTo }} style={styles.needsTagButton}>
          <SearchIcon />
          Search your player tag
        </Link>
      </div>
    </div>
  );
}

const styles = {
  needsTag: {
    position: 'relative' as const,
    width: '100%',
    maxWidth: '760px',
    margin: '0 auto',
  },
  ghost: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '12px',
    opacity: 0.55,
    maskImage: 'linear-gradient(180deg, #000 0%, transparent 92%)',
    WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 92%)',
    pointerEvents: 'none' as const,
  },
  ghostDeck: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    padding: '10px 12px 12px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
  },
  ghostHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  ghostLine: {
    display: 'block' as const,
    width: '35%',
    height: '10px',
    borderRadius: '5px',
    backgroundColor: 'var(--skeleton-base)',
  },
  ghostWinChance: {
    color: 'var(--accent)',
    fontWeight: 800 as const,
    fontSize: '15px',
  },
  ghostCards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, 1fr)',
  },
  ghostCard: {
    aspectRatio: '0.82',
    borderRadius: '7px',
    backgroundColor: 'var(--skeleton-base)',
  },
  needsTagCard: {
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(400px, calc(100% - 24px))',
    textAlign: 'center' as const,
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--panel-border)',
    borderRadius: '18px',
    boxShadow: 'var(--dialog-shadow)',
  },
  needsTagIcon: {
    width: '56px',
    height: '56px',
    margin: '0 auto 14px',
    borderRadius: '16px',
    display: 'grid' as const,
    placeItems: 'center' as const,
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-a20)',
  },
  needsTagText: {
    margin: '0 0 4px',
    color: 'var(--text-secondary)',
    fontSize: '15px',
    lineHeight: 1.6,
  },
  needsTagButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    marginTop: '16px',
    padding: '11px 22px',
    borderRadius: '10px',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
};
