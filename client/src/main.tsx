import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from './AppContext'
import Layout from './components/Layout'
import WarDeckGenerator from './pages/WarDeckGenerator'
import WarDeckBuilder from './pages/WarDeckBuilder'
import Faq from './pages/Faq'
import BestWarDecks from './pages/BestWarDecks'
import './index.css'

// One client for the app's lifetime. Server data (meta status, player decks,
// card catalog, collections, best decks, deck scores) all flows through here,
// so navigating between pages reuses cached results instead of re-fetching.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The CR-derived data is stable within a session — don't re-fetch on a
      // window refocus, and treat results as fresh for a minute. Per-query
      // overrides (e.g. Infinity for the static catalog) live in queries.ts.
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<WarDeckGenerator />} />
            <Route path="/builder" element={<WarDeckBuilder />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/best-decks" element={<BestWarDecks />} />
            <Route path="/:playerId" element={<WarDeckGenerator />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
