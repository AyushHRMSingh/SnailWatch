import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import PlaneWatcherz from './pages/PlaneWatcherz.tsx'
import PlaneTrackerz from './pages/PlaneTrackerz.tsx'
import Navigation from './components/Navigation.tsx'
import { ColorProvider } from './context/ColorContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorProvider>
      <BrowserRouter>
        <Navigation />
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/watcherz" element={<PlaneWatcherz />} />
          <Route path="/trackerz" element={<PlaneTrackerz />} />
        </Routes>
      </BrowserRouter>
    </ColorProvider>
  </StrictMode>,
)
