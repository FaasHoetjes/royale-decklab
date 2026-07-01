import { useApp } from '../AppContext';

// The sun/moon toggle button, positioning-agnostic: Layout renders it fixed in
// the top-right corner on desktop, the mobile top bar renders it inline.
export default function ThemeToggle({ size = 28 }: { size?: number }) {
  const { isDarkMode, toggleDarkMode } = useApp();
  return (
    <button
      onClick={toggleDarkMode}
      className="theme-toggle-btn"
      style={styles.button}
      title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDarkMode ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
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
        <svg width={size} height={size} viewBox="0 0 24 24" fill="#1a1a1a" stroke="#1a1a1a" strokeWidth="1" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

const styles = {
  button: {
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
