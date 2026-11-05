import { Link } from 'react-router-dom';
import { TrophyIcon } from '../navIcons';

export default function NoDecks({ onNewSearch, isMobile }: { onNewSearch: () => void; isMobile: boolean }) {
  return (
    <div style={{ ...styles.empty, minHeight: isMobile ? 'calc(100dvh - 180px)' : 'calc(100dvh - 100px)' }} role="status">
      <div style={styles.emptyIcon} aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="3" width="12" height="16" rx="2" />
          <path d="M4 7v12a2 2 0 0 0 2 2h9" />
          <path d="M11 9l4 4M15 9l-4 4" />
        </svg>
      </div>
      <h2 style={styles.emptyTitle}>We couldn't build a war deck</h2>
      <p style={styles.emptyText}>
        None of the popular war decks can be built from your cards yet. Unlock a few more cards and check back.
      </p>
      <div style={{ ...styles.emptyActions, flexDirection: isMobile ? 'column' : 'row' }}>
        <Link to="/best-decks" style={{ ...styles.emptyButton, ...styles.emptyPrimary }}>
          <TrophyIcon />
          See the best war decks
        </Link>
        <button type="button" onClick={onNewSearch} style={styles.emptyButton}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          Search another player
        </button>
      </div>
    </div>
  );
}

const styles = {
  empty: {
    maxWidth: '420px',
    margin: '0 auto',
    padding: '24px 20px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    textAlign: 'center' as const,
  },
  emptyIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    display: 'grid' as const,
    placeItems: 'center' as const,
    color: 'var(--accent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    boxShadow: '0 0 0 8px color-mix(in srgb, var(--accent) 6%, transparent)',
  },
  emptyTitle: {
    margin: '22px 0 6px',
    fontSize: '20px',
    fontWeight: 700 as const,
    color: 'var(--text-primary)',
  },
  emptyText: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.55,
    color: 'var(--text-secondary)',
  },
  emptyActions: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    alignSelf: 'stretch' as const,
    gap: '10px',
    marginTop: '22px',
  },
  emptyButton: {
    height: '40px',
    padding: '0 16px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 600 as const,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  emptyPrimary: {
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
  },
};
