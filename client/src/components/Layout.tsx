import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';
import { ElixirGradientDefs } from './ElixirBadge';
import Landing from '../pages/Landing';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePrefetchAppData } from '../queries';

function CornerThemeToggle() {
  return (
    <div style={styles.themeToggle}>
      <ThemeToggle />
    </div>
  );
}

export default function Layout() {
  const { activePlayerTag } = useApp();
  const theme = getTheme();
  const isMobile = useIsMobile();

  // Warm every page's cache (upgrade advice, collection, card catalog, best
  // decks) the moment a tag is active, so navigating opens pages instantly
  // instead of fetching on click.
  usePrefetchAppData(activePlayerTag);

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
        {/* On mobile the toggle lives inside the top bar instead. */}
        {!isMobile && <CornerThemeToggle />}
        <ElixirGradientDefs />
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
    // Deliberately no background/color transition: animating the full-viewport
    // shell repaints everything under it every frame for the whole duration,
    // which visibly stutters on card-dense pages (Best War Decks). An instant
    // flip is one repaint.
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
