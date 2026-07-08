import { createContext, useContext, useState, type ReactNode } from 'react';

// Theme state lives in ThemeContext, not here: keeping it separate means a
// light/dark toggle doesn't re-render every consumer of this context.

interface AppContextValue {
  activePlayerTag: string | null;
  setActivePlayerTag: (tag: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activePlayerTag, setActivePlayerTagState] = useState<string | null>(() => {
    return localStorage.getItem('activePlayerTag');
  });

  const setActivePlayerTag = (tag: string | null) => {
    setActivePlayerTagState(tag);
    if (tag) {
      localStorage.setItem('activePlayerTag', tag);
    } else {
      localStorage.removeItem('activePlayerTag');
    }
  };

  return (
    <AppContext.Provider value={{ activePlayerTag, setActivePlayerTag }}>
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
