import { createContext, useContext, useState, type ReactNode } from 'react';

interface AppContextValue {
  activePlayerTag: string | null;
  setActivePlayerTag: (tag: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activePlayerTag, setActivePlayerTagState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('activePlayerTag');
    } catch {
      return null;
    }
  });

  const setActivePlayerTag = (tag: string | null) => {
    setActivePlayerTagState(tag);
    try {
      if (tag) {
        localStorage.setItem('activePlayerTag', tag);
      } else {
        localStorage.removeItem('activePlayerTag');
      }
    } catch {
      // Storage is blocked: the player still applies for this visit.
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
