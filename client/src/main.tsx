import React, { lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from './AppContext'
import { ThemeProvider } from './ThemeContext'
import Layout from './components/Layout'
import NotFound from './pages/NotFound'
import Landing from './pages/Landing'
import { retryDelay, shouldRetry } from './lib/retry'
import { pageLoaders } from './lib/pageLoaders'
import { isValidTag } from './lib/playerTag'
import './index.css'

// Route chunks load on navigation or a focused, hovered, or touched destination.
const WarDeckGenerator = lazy(pageLoaders.generator)
const WarDeckBuilder = lazy(pageLoaders.builder)
const Faq = lazy(pageLoaders.faq)
const BestWarDecks = lazy(pageLoaders.bestDecks)
const UpgradeAdvisor = lazy(pageLoaders.upgrades)
const Cards = lazy(pageLoaders.cards)
const CardPage = lazy(pageLoaders.cardPage)
const ClanWarPlanner = lazy(pageLoaders.clan)
const AdminStats = lazy(() => import('./pages/AdminStats'))

// Any single-segment path lands here, so one that isn't a player tag is an unknown page.
const PlayerPage = () => {
  const { playerId } = useParams()
  const isPlayer = !!playerId && isValidTag(playerId)
  return isPlayer ? <WarDeckGenerator /> : <NotFound />
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
              <Route path="/clan" element={<ClanWarPlanner />} />
              <Route path="/clan/:clanTag" element={<ClanWarPlanner />} />
              <Route path="/admin/stats" element={<AdminStats />} />
              <Route path="/:playerId" element={<PlayerPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
