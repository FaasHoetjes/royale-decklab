import { NavLink } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';

export default function Sidebar() {
  const { isDarkMode, activePlayerTag, setActivePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);

  // The generator keys off the URL player id, so point it at the active tag.
  const generatorTo = activePlayerTag ? `/${activePlayerTag.replace('#', '')}` : '/';

  const navItems = [
    { to: generatorTo, label: 'War Deck Generator', end: true },
    { to: '/builder', label: 'War Deck Builder', end: false },
    { to: '/draft', label: 'Mega Draft', end: false },
    { to: '/faq', label: 'FAQ', end: false },
  ];

  return (
    <nav
      style={{
        ...styles.sidebar,
        backgroundColor: theme.bg.secondary,
        borderRightColor: theme.border,
      }}
    >
      <div style={{ ...styles.brand, color: theme.text.primary }}>
        <div style={styles.brandTop}>ROYALE</div>
        <div style={styles.brandBottom}>DECKLAB</div>
      </div>

      <div style={styles.navList}>
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              ...styles.navLink,
              color: isActive ? '#ffffff' : theme.text.secondary,
              backgroundColor: isActive ? theme.accent : 'transparent',
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      {activePlayerTag && (
        <div style={{ ...styles.playerBox, borderTopColor: theme.border }}>
          <div style={{ ...styles.playerLabel, color: theme.text.secondary }}>Player</div>
          <div style={{ ...styles.playerTag, color: theme.text.primary }}>{activePlayerTag}</div>
          <button
            onClick={() => setActivePlayerTag(null)}
            style={{ ...styles.changeButton, color: theme.accent }}
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
  brand: {
    alignSelf: 'flex-start' as const,
    marginBottom: '32px',
    paddingLeft: '8px',
    lineHeight: 1.05,
  },
  brandTop: {
    fontSize: '22px',
    fontWeight: 700 as const,
    letterSpacing: '1px',
    textAlign: 'right' as const,
  },
  brandBottom: {
    fontSize: '30px',
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
