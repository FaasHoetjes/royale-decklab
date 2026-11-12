import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme, type Theme } from '../theme';
import { usePlayerSwitcher } from '../hooks/usePlayerSwitcher';
import ThemeToggle from './ThemeToggle';
import Sheet from './Sheet';
import PlayerMenu, { Avatar } from './PlayerMenu';
import { toolItems, pageTitle, FAQ_ITEM } from './navItems';
import { MailIcon, GitHubIcon } from './navIcons';
import { CONTACT_EMAIL_URL, GITHUB_URL } from '../lib/contact';

/** Phones: a top bar with the page title and your player, and the tools in a tab bar at the bottom. */
export default function MobileNav() {
  const { activePlayerTag } = useApp();
  const { pathname } = useLocation();
  const theme = getTheme();
  const switcher = usePlayerSwitcher();
  const [sheetOpen, setSheetOpen] = useState(false);
  const tabs = toolItems(activePlayerTag);
  // The tapped tab lights up right away; the page it opens can take a moment to render on a phone.
  const [tapped, setTapped] = useState<string | null>(null);
  useEffect(() => setTapped(null), [pathname]);
  const lit = (to: string, isActive: boolean) => (tapped ? tapped === to : isActive);

  return (
    <>
      <header style={{ ...styles.bar, backgroundColor: theme.bg.secondary, borderBottomColor: theme.border }}>
        <span style={{ ...styles.barTitle, color: theme.text.primary }}>
          {(pathname !== '/' && pageTitle(pathname, tabs)) || 'Royale DeckLab'}
        </span>
        <div style={styles.barRight}>
          <ThemeToggle size={22} />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="theme-toggle-btn mobile-touch-target"
            aria-label={switcher.tag ? `Player ${switcher.name ?? switcher.tag}, more options` : 'More options'}
            aria-expanded={sheetOpen}
            style={styles.avatarButton}
          >
            <Avatar name={switcher.name} size={30} />
          </button>
        </div>
      </header>

      <nav aria-label="Main menu" style={{ ...styles.tabBar, backgroundColor: theme.bg.secondary, borderTopColor: theme.border }}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.end}
            aria-label={tab.tab}
            className="tab-link"
            onClick={() => setTapped(tab.to)}
            style={({ isActive }) => ({
              ...styles.tab,
              ...(lit(tab.to, isActive) && styles.tabLit),
              color: lit(tab.to, isActive) ? theme.text.primary : theme.text.secondary,
            })}
          >
            {({ isActive }) =>
              lit(tab.to, isActive) ? (
                <>
                  <span className="tab-pill" style={styles.tabPill} />
                  <span style={{ ...styles.tabIcon, color: theme.accent }} aria-hidden="true">
                    {tab.icon}
                  </span>
                  <span style={styles.tabLabel}>{tab.tab}</span>
                </>
              ) : (
                <span style={styles.tabIcon} aria-hidden="true">
                  {tab.icon}
                </span>
              )
            }
          </NavLink>
        ))}
      </nav>

      {sheetOpen && <MoreSheet theme={theme} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

/** Your player and the switcher, plus help and contact links, in a sheet that slides up. */
function MoreSheet({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const switcher = usePlayerSwitcher();
  const rowStyle = { ...styles.sheetRow, color: theme.text.primary };

  return (
    <Sheet ariaLabel="Player and more" onClose={onClose}>
      <div style={{ ...styles.sheetHeading, color: theme.text.tertiary }}>Player</div>
      <PlayerMenu switcher={switcher} theme={theme} onDone={onClose} />
      <div style={{ ...styles.divider, backgroundColor: theme.border }} />
      <Link to={FAQ_ITEM.to} onClick={onClose} className="nav-link" style={rowStyle}>
        <span style={{ ...styles.rowIcon, color: theme.text.secondary }} aria-hidden="true">{FAQ_ITEM.icon}</span>
        FAQ
      </Link>
      <a href={CONTACT_EMAIL_URL} className="nav-link" style={rowStyle}>
        <span style={{ ...styles.rowIcon, color: theme.text.secondary }} aria-hidden="true"><MailIcon /></span>
        Contact
      </a>
      <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="nav-link" style={rowStyle}>
        <span style={{ ...styles.rowIcon, color: theme.text.secondary }} aria-hidden="true"><GitHubIcon /></span>
        GitHub
      </a>
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
    justifyContent: 'space-between' as const,
    gap: '12px',
    padding: '0 8px 0 14px',
    borderBottom: '1px solid',
    position: 'sticky' as const,
    top: 0,
    zIndex: 900,
  },
  barTitle: {
    minWidth: 0,
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
  avatarButton: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: '7px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  tabBar: {
    position: 'fixed' as const,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 900,
    display: 'flex' as const,
    gap: '2px',
    padding: '8px 8px calc(8px + env(safe-area-inset-bottom))',
    borderTop: '1px solid',
  },
  tab: {
    position: 'relative' as const,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: '44px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '6px',
    borderRadius: '22px',
    textDecoration: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  tabLit: {
    flexGrow: 2.6,
    minWidth: 'max-content',
    padding: '0 12px',
  },
  tabPill: {
    position: 'absolute' as const,
    inset: 0,
    borderRadius: '22px',
    backgroundColor: 'color-mix(in srgb, var(--accent) 16%, transparent)',
  },
  tabIcon: {
    position: 'relative' as const,
    display: 'flex' as const,
  },
  tabLabel: {
    position: 'relative' as const,
    fontSize: '12.5px',
    fontWeight: 700 as const,
    whiteSpace: 'nowrap' as const,
  },
  sheetHeading: {
    padding: '0 8px 6px',
    fontSize: '13px',
    fontWeight: 600 as const,
  },
  divider: {
    height: '1px',
    margin: '10px 0',
  },
  sheetRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    minHeight: '44px',
    padding: '0 8px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: 600 as const,
  },
  rowIcon: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '30px',
    flexShrink: 0,
  },
};
