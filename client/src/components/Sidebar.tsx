import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../useIsMobile';
import ThemeToggle from './ThemeToggle';

export default function Sidebar() {
  const { isDarkMode, activePlayerTag, setActivePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Leaving mobile (rotation / resize) discards the drawer state so it can't
  // reappear open on the next shrink.
  useEffect(() => {
    if (!isMobile && drawerOpen) setDrawerOpen(false);
  }, [isMobile, drawerOpen]);

  // While the drawer is up, the page behind it must not scroll.
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

  // The generator keys off the URL player id, so point it at the active tag.
  const generatorTo = activePlayerTag ? `/${activePlayerTag.replace('#', '')}` : '/';

  // Active nav item. Both modes share the same shape: a neutral fill (slightly
  // off the sidebar surface) and primary-colored text (white in dark, black in
  // light) that earns its accent identity from a single left bar — gold in dark
  // mode, blue in light. Keeping the text neutral in both modes makes the active
  // item read the same way (the bar is the accent, not the label).
  const activeBg = isDarkMode ? theme.bg.elevated : theme.bg.tertiary;
  const activeText = theme.accent;
  const activeBar = `inset 3px 0 0 ${theme.accent}`;

  const navItems = [
    { to: generatorTo, label: 'War Deck Generator', end: true, icon: <ZapIcon /> },
    { to: '/builder', label: 'War Deck Builder', end: false, icon: <GridIcon /> },
    { to: '/best-decks', label: 'Best War Decks', end: false, icon: <TrophyIcon /> },
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
        color: isActive ? activeText : theme.text.secondary,
        // Leave inactive items' background unset (not 'transparent') so the
        // `.nav-link:not(.active):hover` CSS rule isn't beaten by an inline style.
        backgroundColor: isActive ? activeBg : undefined,
        boxShadow: isActive ? activeBar : 'none',
      })}
    >
      <span style={styles.navIcon} aria-hidden="true">{item.icon}</span>
      {item.label}
    </NavLink>
  );

  const contactLink = (
    <a
      href="mailto:faashoetjes+royaledecklab@gmail.com"
      className="nav-link"
      style={{ ...styles.contactLink, color: theme.text.secondary }}
    >
      <span style={styles.navIcon} aria-hidden="true"><MailIcon /></span>
      Contact
    </a>
  );

  const playerBox = activePlayerTag && (
    <div style={{ ...styles.playerBox, borderTopColor: theme.border }}>
      <div style={{ ...styles.playerLabel, color: theme.text.secondary }}>Player</div>
      <div style={{ ...styles.playerTag, color: theme.text.primary }}>{activePlayerTag}</div>
      <button
        onClick={() => {
          setDrawerOpen(false);
          setActivePlayerTag(null);
        }}
        style={{ ...styles.changeButton, color: theme.accent }}
      >
        Change player
      </button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Mobile: a compact sticky top bar (brand · theme toggle · hamburger) plus a
  // right-hand slide-in drawer holding the full nav, contact link and player box.
  // ---------------------------------------------------------------------------
  if (isMobile) {
    return (
      <>
        <header
          style={{ ...styles.bar, backgroundColor: theme.bg.secondary, borderBottomColor: theme.border }}
        >
          <div style={{ ...styles.brandMobile, color: theme.text.primary }}>
            ROYALE<span style={styles.brandMobileBold}> DECKLAB</span>
          </div>
          <div style={styles.barActions}>
            <ThemeToggle size={22} />
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className="theme-toggle-btn"
              style={{ ...styles.menuButton, color: theme.text.primary }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
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
                <div style={{ ...styles.brandMobile, color: theme.text.primary }}>
                  ROYALE<span style={styles.brandMobileBold}> DECKLAB</span>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="theme-toggle-btn"
                  style={{ ...styles.menuButton, color: theme.text.secondary }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>

              <div style={styles.navList}>{navItems.map(renderNavLink)}</div>

              <div style={styles.footer}>
                {contactLink}
                {playerBox}
              </div>
            </nav>
          </div>
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Desktop: the full-height side column.
  // ---------------------------------------------------------------------------
  return (
    <nav
      style={{ ...styles.sidebar, backgroundColor: theme.bg.secondary, borderRightColor: theme.border }}
    >
      <div style={{ ...styles.brand, color: theme.text.primary }}>
        <div style={styles.brandTop}>ROYALE</div>
        <div style={styles.brandBottom}>DECKLAB</div>
      </div>

      <div style={styles.navList}>{navItems.map(renderNavLink)}</div>

      <div style={styles.footer}>
        {contactLink}
        {playerBox}
      </div>
    </nav>
  );
}

const styles = {
  sidebar: {
    width: '240px',
    flexShrink: 0,
    minHeight: '100vh',
    borderRight: '1px solid #e0e0e0',
    padding: '24px 16px',
    boxSizing: 'border-box' as const,
    position: 'sticky' as const,
    top: 0,
    alignSelf: 'flex-start' as const,
    transition: 'background-color 0.3s ease',
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  // Mobile: a sticky top bar — brand on the left, theme toggle + menu button on
  // the right. Navigation itself lives in the drawer.
  bar: {
    width: '100%',
    boxSizing: 'border-box' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
    padding: '8px 8px 8px 14px',
    borderBottom: '1px solid #e0e0e0',
    position: 'sticky' as const,
    top: 0,
    zIndex: 900,
    transition: 'background-color 0.3s ease',
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
  // Pinned to the bottom of the column; holds the contact link and player box.
  footer: {
    marginTop: 'auto',
    paddingTop: '16px',
  },
  contactLink: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '11px',
    padding: '10px 14px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600 as const,
    transition: 'all 0.2s ease',
  },
  playerBox: {
    marginTop: '4px',
    paddingTop: '16px',
    borderTop: '1px solid #e0e0e0',
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

// Stroke-based line icons (Lucide style) so they inherit the nav item's text
// color via `currentColor` and stay crisp at the 18px sidebar size.
const ICON_SIZE = 18;

function iconProps() {
  return {
    width: ICON_SIZE,
    height: ICON_SIZE,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

// War Deck Generator — a bolt for the one-tap "generate".
function ZapIcon() {
  return (
    <svg {...iconProps()}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

// War Deck Builder — a card grid for hand-picking the eight slots.
function GridIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

// Best War Decks — a trophy for the top performers.
function TrophyIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

// FAQ — a help bubble.
function HelpIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// Contact — an envelope.
function MailIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}
