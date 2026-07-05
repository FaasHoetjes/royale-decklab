import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface AppContextValue {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  activePlayerTag: string | null;
  setActivePlayerTag: (tag: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Guarded like the pre-paint script in index.html: this runs inside the
    // provider's initializer, so an unparseable stored value must fall back to
    // light mode, not white-screen the whole app.
    try {
      return JSON.parse(localStorage.getItem('darkMode') ?? 'false') === true;
    } catch {
      return false;
    }
  });

  const [activePlayerTag, setActivePlayerTagState] = useState<string | null>(() => {
    return localStorage.getItem('activePlayerTag');
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    // The whole palette hangs off this one attribute (see index.css): flipping it
    // recolors every var(--x) natively in a single pass. index.html sets it before
    // first paint from the same localStorage key, so this only handles toggles.
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    // Drive native UI (scrollbars, form controls) off the theme so nested
    // scroll containers — e.g. the card picker grid — match the page scrollbar.
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev: boolean) => !prev);

  const setActivePlayerTag = (tag: string | null) => {
    setActivePlayerTagState(tag);
    if (tag) {
      localStorage.setItem('activePlayerTag', tag);
    } else {
      localStorage.removeItem('activePlayerTag');
    }
  };

  return (
    <AppContext.Provider
      value={{ isDarkMode, toggleDarkMode, activePlayerTag, setActivePlayerTag }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
