import { NavLink } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../useIsMobile';

export default function Sidebar() {
  const { isDarkMode, activePlayerTag, setActivePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);
  const isMobile = useIsMobile();

  // The generator keys off the URL player id, so point it at the active tag.
  const generatorTo = activePlayerTag ? `/${activePlayerTag.replace('#', '')}` : '/';

  // Active nav item. Dark mode stays neutral grey for the fill and earns its
  // identity from a single gold left accent bar + brighter text — no blue tint.
  // Light mode fills with the blue accent as before.
  const activeBg = isDarkMode ? theme.bg.elevated : theme.accent;
  const activeText = isDarkMode ? theme.text.primary : '#ffffff';
  const activeBar = isDarkMode ? `inset 3px 0 0 ${theme.accent}` : 'none';

  const navItems = [
    { to: generatorTo, label: 'War Deck Generator', end: true },
    { to: '/builder', label: 'War Deck Builder', end: false },
    { to: '/best-decks', label: 'Best War Decks', end: false },
    { to: '/faq', label: 'FAQ', end: false },
  ];

  return (
    <nav
      style={
        isMobile
          ? { ...styles.bar, backgroundColor: theme.bg.secondary, borderBottomColor: theme.border }
          : { ...styles.sidebar, backgroundColor: theme.bg.secondary, borderRightColor: theme.border }
      }
    >
      {isMobile ? (
        <div style={{ ...styles.brandMobile, color: theme.text.primary }}>
          ROYALE<span style={styles.brandMobileBold}> DECKLAB</span>
        </div>
      ) : (
        <div style={{ ...styles.brand, color: theme.text.primary }}>
          <div style={styles.brandTop}>ROYALE</div>
          <div style={styles.brandBottom}>DECKLAB</div>
        </div>
      )}

      <div style={isMobile ? styles.navListMobile : styles.navList}>
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            className="nav-link"
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isMobile ? styles.navLinkMobile : {}),
              color: isActive ? activeText : theme.text.secondary,
              backgroundColor: isActive ? activeBg : 'transparent',
              boxShadow: isActive ? activeBar : 'none',
            })}
          >
            {item.label}
          </NavLink>
        ))}
        {/* On the mobile top bar there's no room for the player box, so the
            "change player" action rides along at the end of the nav strip. */}
        {isMobile && activePlayerTag && (
          <button
            onClick={() => setActivePlayerTag(null)}
            className="nav-link"
            style={{ ...styles.navLink, ...styles.navLinkMobile, background: 'none', border: 'none', cursor: 'pointer', color: theme.text.secondary }}
          >
            Change
          </button>
        )}
      </div>

      {activePlayerTag && !isMobile && (
        <div style={{ ...styles.playerBox, borderTopColor: theme.border }}>
          <div style={{ ...styles.playerLabel, color: theme.text.secondary }}>Player</div>
          <div style={{ ...styles.playerTag, color: theme.text.primary }}>{activePlayerTag}</div>
          <button
            onClick={() => setActivePlayerTag(null)}
            style={{ ...styles.changeButton, color: isDarkMode ? '#cccccc' : theme.accent }}
          >
            Change player
          </button>
        </div>
      )}
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
  // Mobile: a sticky horizontal top bar instead of the full-height side column.
  // Right padding clears the fixed theme toggle in the top-right corner.
  bar: {
    width: '100%',
    boxSizing: 'border-box' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
    padding: '10px 56px 10px 14px',
    borderBottom: '1px solid #e0e0e0',
    position: 'sticky' as const,
    top: 0,
    zIndex: 900,
    transition: 'background-color 0.3s ease',
  },
  brand: {
    alignSelf: 'flex-start' as const,
    marginBottom: '32px',
    paddingLeft: '8px',
    lineHeight: 1.05,
  },
  brandMobile: {
    fontSize: '20px',
    fontWeight: 700 as const,
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    lineHeight: 1,
  },
  brandMobileBold: {
    fontWeight: 800 as const,
  },
  navListMobile: {
    display: 'flex' as const,
    flexDirection: 'row' as const,
    gap: '4px',
    overflowX: 'auto' as const,
    flex: 1,
  },
  navLinkMobile: {
    padding: '8px 12px',
    fontSize: '14px',
    whiteSpace: 'nowrap' as const,
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
    display: 'block',
    padding: '12px 14px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: 600 as const,
    transition: 'all 0.2s ease',
  },
  playerBox: {
    marginTop: 'auto',
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
