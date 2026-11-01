import React, { lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from './AppContext'
import { ThemeProvider } from './ThemeContext'
import Layout from './components/Layout'
import WarDeckGenerator from './pages/WarDeckGenerator'
import NotFound from './pages/NotFound'
import Landing from './pages/Landing'
import { retryDelay, shouldRetry } from './lib/retry'
import './index.css'

// The generator is where nearly every visit starts; the other pages load as separate chunks.
const loadBuilder = () => import('./pages/WarDeckBuilder')
const loadFaq = () => import('./pages/Faq')
const loadBestDecks = () => import('./pages/BestWarDecks')
const loadUpgrades = () => import('./pages/UpgradeAdvisor')
const loadCards = () => import('./pages/Cards')
const loadCardPage = () => import('./pages/CardPage')
const WarDeckBuilder = lazy(loadBuilder)
const Faq = lazy(loadFaq)
const BestWarDecks = lazy(loadBestDecks)
const UpgradeAdvisor = lazy(loadUpgrades)
const Cards = lazy(loadCards)
const CardPage = lazy(loadCardPage)

// Fetch them once the first page is up, so switching tabs never waits on the network.
const preloadPages = () => [loadBuilder, loadFaq, loadBestDecks, loadUpgrades, loadCards, loadCardPage].forEach((load) => load().catch(() => {}))
if ('requestIdleCallback' in window) {
  requestIdleCallback(preloadPages, { timeout: 3000 })
} else {
  setTimeout(preloadPages, 1500)
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: shouldRetry,
      retryDelay,
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
              <Route path="/" element={<Landing />} />
              <Route path="/builder" element={<WarDeckBuilder />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/best-decks" element={<BestWarDecks />} />
              <Route path="/upgrades" element={<UpgradeAdvisor />} />
              <Route path="/cards" element={<Cards />} />
              <Route path="/cards/:slug" element={<CardPage />} />
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
