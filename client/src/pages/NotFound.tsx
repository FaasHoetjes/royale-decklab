import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';

/** Catch-all for unmatched routes (only multi-segment paths, since `/:playerId` claims single segments). */
export default function NotFound() {
  const { isDarkMode } = useApp();
  const theme = getTheme(isDarkMode);

  return (
    <div style={styles.container}>
      <h2 style={{ color: theme.text.primary, margin: 0 }}>Page not found</h2>
      <p style={{ color: theme.text.secondary }}>
        That link doesn't match anything here; it may be mistyped or outdated.
      </p>
      <Link to="/" style={{ ...styles.homeLink, backgroundColor: theme.accent, color: theme.onAccent }}>
        Back to the generator
      </Link>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '460px',
    margin: '0 auto',
    padding: '80px 20px',
    textAlign: 'center' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: '16px',
  },
  homeLink: {
    padding: '12px 24px',
    borderRadius: '8px',
    fontWeight: 700 as const,
    textDecoration: 'none',
  },
};
