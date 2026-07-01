import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Landing from '../pages/Landing';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../useIsMobile';

function ThemeToggle() {
  const { isDarkMode, toggleDarkMode } = useApp();
  return (
    <div style={styles.themeToggle}>
      <button
        onClick={toggleDarkMode}
        className="theme-toggle-btn"
        style={styles.themeButton}
        title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDarkMode ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="5" fill="#ffffff" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#1a1a1a" stroke="#1a1a1a" strokeWidth="1" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function Layout() {
  const { isDarkMode, activePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);
  const isMobile = useIsMobile();

  // Until a player tag is set, the app is just the landing page (no sidebar).
  if (!activePlayerTag) {
    return (
      <div
        style={{
          ...styles.shell,
          backgroundColor: theme.bg.primary,
          color: theme.text.primary,
        }}
      >
        <ThemeToggle />
        <Landing />
      </div>
    );
  }

  return (
    <div
      style={{
        ...styles.shell,
        // On phones the side column becomes a top bar, so stack vertically.
        flexDirection: isMobile ? 'column' : 'row',
        backgroundColor: theme.bg.primary,
        color: theme.text.primary,
      }}
    >
      <Sidebar />
      <main style={{ ...styles.content, padding: isMobile ? '12px' : '20px' }}>
        <ThemeToggle />
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  shell: {
    display: 'flex' as const,
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    transition: 'background-color 0.3s ease, color 0.3s ease',
  },
  content: {
    flex: 1,
    minWidth: 0,
    padding: '20px',
    position: 'relative' as const,
  },
  themeToggle: {
    position: 'fixed' as const,
    top: '20px',
    right: '20px',
    zIndex: 1000,
  },
  themeButton: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: '8px',
    transition: 'all 0.3s ease',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
