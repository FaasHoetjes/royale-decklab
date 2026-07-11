import { Outlet, useMatch } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';
import Footer from './Footer';
import { ElixirGradientDefs } from './ElixirBadge';
import Landing from '../pages/Landing';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePrefetchAppData } from '../queries';
import { isValidTag } from '../lib/playerTag';

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

  const playerMatch = useMatch('/:playerId');
  const isPlayerDeepLink =
    !!playerMatch?.params.playerId && isValidTag(playerMatch.params.playerId);

  usePrefetchAppData(activePlayerTag);

  if (!activePlayerTag && !isPlayerDeepLink) {
    return (
      <div
        style={{
          ...styles.shell,
          flexDirection: 'column' as const,
          backgroundColor: theme.bg.primary,
          color: theme.text.primary,
        }}
      >
        <CornerThemeToggle />
        <Landing />
        <Footer />
      </div>
    );
  }

  return (
    <div
      style={{
        ...styles.shell,
        flexDirection: isMobile ? 'column' : 'row',
        backgroundColor: theme.bg.primary,
        color: theme.text.primary,
      }}
    >
      <Sidebar />
      <main style={{ ...styles.content, padding: isMobile ? '12px' : '20px' }}>
        {!isMobile && <CornerThemeToggle />}
        <ElixirGradientDefs />
        <Outlet />
        <Footer />
      </main>
    </div>
  );
}

const styles = {
  shell: {
    display: 'flex' as const,
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
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
