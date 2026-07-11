import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import ThemeToggle from './ThemeToggle';
import { ZapIcon, GridIcon, TrophyIcon, TrendingUpIcon, HelpIcon, MailIcon, GitHubIcon, MenuIcon, CloseIcon } from './navIcons';

export default function Sidebar() {
  const { activePlayerTag, setActivePlayerTag } = useApp();
  const navigate = useNavigate();
  const theme = getTheme();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isMobile && drawerOpen) setDrawerOpen(false);
  }, [isMobile, drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const generatorTo = activePlayerTag ? `/${activePlayerTag.replace('#', '')}` : '/';

  const activeBg = 'var(--nav-active-bg)';

  const navItems = [
    { to: generatorTo, label: 'War Deck Generator', end: true, icon: <ZapIcon /> },
    { to: '/best-decks', label: 'Best War Decks', end: false, icon: <TrophyIcon /> },
    { to: '/builder', label: 'War Deck Builder', end: false, icon: <GridIcon /> },
    { to: '/upgrades', label: 'Upgrade Advisor', end: false, icon: <TrendingUpIcon /> },
    { to: '/faq', label: 'FAQ', end: false, icon: <HelpIcon /> },
  ];

  const renderNavLink = (item: (typeof navItems)[number]) => (
    <NavLink
      key={item.label}
      to={item.to}
      end={item.end}
      className="nav-link"
      onClick={() => setDrawerOpen(false)}
      style={({ isActive }) => ({
        ...styles.navLink,
        color: isActive ? theme.accent : theme.text.secondary,
        // Leave inactive backgrounds unset (not 'transparent') so the
        // `.nav-link:not(.active):hover` CSS rule isn't beaten by inline style.
        backgroundColor: isActive ? activeBg : undefined,
        boxShadow: isActive ? `inset 3px 0 0 ${theme.accent}` : 'none',
      })}
    >
      <span style={styles.navIcon} aria-hidden="true">{item.icon}</span>
      {item.label}
    </NavLink>
  );

  const brand = (
    <div style={{ ...styles.brandMobile, color: theme.text.primary }}>
      ROYALE<span style={styles.brandMobileBold}> DECKLAB</span>
    </div>
  );

  const footer = (
    <div style={styles.footer}>
      <div style={styles.footerIcons}>
        <a
          href="mailto:faashoetjes+royaledecklab@gmail.com"
          className="nav-link"
          aria-label="Contact"
          title="Contact"
          style={{ ...styles.iconButton, color: theme.text.secondary, borderColor: theme.border }}
        >
          <MailIcon />
        </a>
        <a
          href="https://github.com/FaasHoetjes/royale-decklab"
          target="_blank"
          rel="noreferrer"
          className="nav-link"
          aria-label="GitHub repository"
          title="GitHub"
          style={{ ...styles.iconButton, color: theme.text.secondary, borderColor: theme.border }}
        >
          <GitHubIcon />
        </a>
      </div>
      {activePlayerTag && (
        <div style={{ ...styles.playerBox, borderTopColor: theme.border }}>
          <div style={{ ...styles.playerLabel, color: theme.text.secondary }}>Player</div>
          <div style={{ ...styles.playerTag, color: theme.text.primary }}>{activePlayerTag}</div>
          <button
            onClick={() => {
              setDrawerOpen(false);
              setActivePlayerTag(null);
              // Back to the landing URL too; without this the old player's
              // tag lingers in the address bar over the landing screen.
              navigate('/');
            }}
            style={{ ...styles.changeButton, color: theme.accent }}
          >
            Change player
          </button>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <header style={{ ...styles.bar, backgroundColor: theme.bg.secondary, borderBottomColor: theme.border }}>
          {brand}
          <div style={styles.barActions}>
            <ThemeToggle size={22} />
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className="theme-toggle-btn"
              style={{ ...styles.menuButton, color: theme.text.primary }}
            >
              <MenuIcon />
            </button>
          </div>
        </header>

        {drawerOpen && (
          <div
            className="drawer-backdrop"
            style={styles.drawerBackdrop}
            onClick={() => setDrawerOpen(false)}
          >
            <nav
              className="drawer-panel"
              style={{ ...styles.drawer, backgroundColor: theme.bg.secondary }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Main menu"
            >
              <div style={styles.drawerHeader}>
                {brand}
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="theme-toggle-btn"
                  style={{ ...styles.menuButton, color: theme.text.secondary }}
                >
                  <CloseIcon />
                </button>
              </div>

              <div style={styles.navList}>{navItems.map(renderNavLink)}</div>
              {footer}
            </nav>
          </div>
        )}
      </>
    );
  }

  return (
    <nav style={{ ...styles.sidebar, backgroundColor: theme.bg.secondary, borderRightColor: theme.border }}>
      <div style={{ ...styles.brand, color: theme.text.primary }}>
        <div style={styles.brandTop}>ROYALE</div>
        <div style={styles.brandBottom}>DECKLAB</div>
      </div>

      <div style={styles.navList}>{navItems.map(renderNavLink)}</div>
      {footer}
    </nav>
  );
}

const styles = {
  sidebar: {
    width: '240px',
    flexShrink: 0,
    minHeight: '100vh',
    borderRight: '1px solid',
    padding: '24px 16px',
    boxSizing: 'border-box' as const,
    position: 'sticky' as const,
    top: 0,
    alignSelf: 'flex-start' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  bar: {
    width: '100%',
    boxSizing: 'border-box' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
    padding: '8px 8px 8px 14px',
    borderBottom: '1px solid',
    position: 'sticky' as const,
    top: 0,
    zIndex: 900,
  },
  barActions: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '2px',
  },
  menuButton: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: '8px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  drawerBackdrop: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1100,
  },
  drawer: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: 'min(300px, 85vw)',
    boxSizing: 'border-box' as const,
    padding: '12px 16px 24px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.35)',
    overflowY: 'auto' as const,
  },
  drawerHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: '20px',
  },
  brand: {
    alignSelf: 'flex-start' as const,
    marginBottom: '32px',
    paddingLeft: '8px',
    lineHeight: 1.05,
  },
  brandMobile: {
    fontSize: '19px',
    fontWeight: 700 as const,
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    lineHeight: 1,
  },
  brandMobileBold: {
    fontWeight: 800 as const,
  },
  brandTop: {
    fontSize: '28px',
    fontWeight: 700 as const,
    letterSpacing: '1px',
    textAlign: 'right' as const,
  },
  brandBottom: {
    fontSize: '38px',
    fontWeight: 800 as const,
    letterSpacing: '1px',
  },
  navList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '6px',
  },
  navLink: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '11px',
    padding: '12px 14px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: 600 as const,
    transition: 'all 0.2s ease',
  },
  navIcon: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: '16px',
  },
  footerIcons: {
    display: 'flex' as const,
    gap: '8px',
    padding: '0 8px 12px',
  },
  iconButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '1px solid',
    textDecoration: 'none',
  },
  playerBox: {
    marginTop: '4px',
    paddingTop: '16px',
    borderTop: '1px solid',
  },
  playerLabel: {
    fontSize: '11px',
    fontWeight: 600 as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  playerTag: {
    fontSize: '16px',
    fontWeight: 700 as const,
    fontFamily: 'monospace',
    margin: '4px 0 10px',
  },
  changeButton: {
    border: 'none',
    background: 'transparent',
    padding: 0,
    fontSize: '13px',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
};
