import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme, type Theme } from '../theme';
import { usePlayerSwitcher } from '../hooks/usePlayerSwitcher';
import ThemeToggle from './ThemeToggle';
import Sheet from './Sheet';
import PlayerMenu, { Avatar } from './PlayerMenu';
import MobileDrawer from './MobileDrawer';
import { toolItems, pageTitle } from './navItems';
import { MenuIcon } from './navIcons';

/** Phones: a top bar with the menu, the page title, the theme and your player; the menu slides in the desktop sidebar. */
export default function MobileNav() {
  const { activePlayerTag } = useApp();
  const { pathname } = useLocation();
  const theme = getTheme();
  const switcher = usePlayerSwitcher();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <header style={{ ...styles.bar, backgroundColor: theme.bg.secondary, borderBottomColor: theme.border }}>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="theme-toggle-btn mobile-touch-target"
          aria-label="Menu"
          aria-expanded={drawerOpen}
          style={{ ...styles.iconButton, color: theme.text.primary }}
        >
          <MenuIcon />
        </button>
        <span style={{ ...styles.barTitle, color: theme.text.primary }}>
          {(pathname !== '/' && pageTitle(pathname, toolItems(activePlayerTag))) || 'Royale DeckLab'}
        </span>
        <div style={styles.barRight}>
          <ThemeToggle size={22} />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="theme-toggle-btn mobile-touch-target"
            aria-label={switcher.tag ? `Player ${switcher.name ?? switcher.tag}, switch player` : 'Switch player'}
            aria-expanded={sheetOpen}
            style={styles.iconButton}
          >
            <Avatar name={switcher.name} size={30} />
          </button>
        </div>
      </header>

      {drawerOpen && <MobileDrawer onClose={() => setDrawerOpen(false)} />}
      {sheetOpen && <PlayerSheet theme={theme} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

function PlayerSheet({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const switcher = usePlayerSwitcher();
  return (
    <Sheet ariaLabel="Player" onClose={onClose}>
      <div style={{ ...styles.sheetHeading, color: theme.text.tertiary }}>Player</div>
      <PlayerMenu switcher={switcher} theme={theme} onDone={onClose} />
    </Sheet>
  );
}

const styles = {
  bar: {
    width: '100%',
    height: '61px',
    boxSizing: 'border-box' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    padding: '0 8px',
    borderBottom: '1px solid',
    position: 'sticky' as const,
    top: 0,
    zIndex: 900,
  },
  barTitle: {
    flex: 1,
    minWidth: 0,
    paddingLeft: '2px',
    fontSize: '16px',
    fontWeight: 700 as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  barRight: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '2px',
    flexShrink: 0,
  },
  iconButton: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: '7px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  sheetHeading: {
    padding: '0 8px 6px',
    fontSize: '13px',
    fontWeight: 600 as const,
  },
};
