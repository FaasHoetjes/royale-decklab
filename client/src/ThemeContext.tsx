import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Theme state lives in its own context, apart from AppContext, on purpose: all
// theming is CSS variables keyed off <html data-theme> (index.css), so nothing
// but the toggle button itself needs to know the mode. Keeping it out of
// AppContext means flipping the theme re-renders only that button; the rest of
// the app (hundreds of card tiles on some pages) is recolored natively by the
// browser in one pass.

interface ThemeContextValue {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Guarded like the pre-paint script (theme-init.js): this runs inside the
    // provider's initializer, so a failure must fall back to light mode, not
    // white-screen the whole app. With no saved choice we follow the OS
    // (prefers-color-scheme); a saved choice always wins.
    try {
      const stored = localStorage.getItem('darkMode');
      if (stored !== null) return JSON.parse(stored) === true;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    // The whole palette hangs off this one attribute (see index.css): flipping it
    // recolors every var(--x) natively in a single pass. theme-init.js sets it
    // before first paint from the same localStorage key, so this only handles
    // toggles.
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    // Drive native UI (scrollbars, form controls) off the theme so nested
    // scroll containers (e.g. the card picker grid) match the page scrollbar.
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev: boolean) => !prev);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
