import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './AppContext'
import Layout from './components/Layout'
import WarDeckGenerator from './pages/WarDeckGenerator'
import WarDeckBuilder from './pages/WarDeckBuilder'
import MegaDraft from './pages/MegaDraft'
import Faq from './pages/Faq'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<WarDeckGenerator />} />
            <Route path="/builder" element={<WarDeckBuilder />} />
            <Route path="/draft" element={<MegaDraft />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/:playerId" element={<WarDeckGenerator />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  </React.StrictMode>,
)
