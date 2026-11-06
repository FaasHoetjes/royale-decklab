import { getTheme } from '../../theme';
import { useNow } from '../../hooks/useNow';

const TICK_MS = 5_000;

const sinceText = (updatedAt: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${Math.floor(seconds / 10) * 10}s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
};

/** Shows that the page keeps itself up to date, and how fresh it is. */
const LiveUpdated = ({ updatedAt, color }: { updatedAt: number; color?: string }) => {
  const theme = getTheme();
  const now = useNow(TICK_MS);

  return (
    <span style={{ ...styles.wrap, color: color ?? theme.text.secondary }}>
      <span className="clan-live-dot" style={styles.dot} aria-hidden="true" />
      Live · updated {sinceText(updatedAt, Math.max(now, updatedAt))}
    </span>
  );
};

export default LiveUpdated;

const styles = {
  wrap: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '7px',
    fontSize: '12px',
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--up)',
    boxShadow: '0 0 0 3px color-mix(in srgb, var(--up) 22%, transparent)',
  },
};
