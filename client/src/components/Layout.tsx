import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';
import Landing from '../pages/Landing';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../useIsMobile';

function CornerThemeToggle() {
  return (
    <div style={styles.themeToggle}>
      <ThemeToggle />
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
        <CornerThemeToggle />
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
        {/* On mobile the toggle lives inside the top bar (next to the menu
            button), so the floating corner button would double up. */}
        {!isMobile && <CornerThemeToggle />}
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
};
