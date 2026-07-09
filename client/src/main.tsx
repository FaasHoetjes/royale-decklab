import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from './AppContext'
import { ThemeProvider } from './ThemeContext'
import Layout from './components/Layout'
import WarDeckGenerator from './pages/WarDeckGenerator'
import WarDeckBuilder from './pages/WarDeckBuilder'
import Faq from './pages/Faq'
import BestWarDecks from './pages/BestWarDecks'
import UpgradeAdvisor from './pages/UpgradeAdvisor'
import NotFound from './pages/NotFound'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is stable within a session; per-query overrides live in queries.ts.
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
      <ThemeProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<WarDeckGenerator />} />
              <Route path="/builder" element={<WarDeckBuilder />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/best-decks" element={<BestWarDecks />} />
              <Route path="/upgrades" element={<UpgradeAdvisor />} />
              <Route path="/:playerId" element={<WarDeckGenerator />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
