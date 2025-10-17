import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Navigation from './components/Navigation.tsx'
import { ColorProvider } from './context/ColorContext.tsx'

// Lazy load heavy components
const PlaneWatcherz = lazy(() => import('./pages/PlaneWatcherz.tsx'))
const PlaneTrackerz = lazy(() => import('./pages/PlaneTrackerz.tsx'))
const PlaneAlertzWatch = lazy(() => import('./pages/PlaneAlertzWatch.tsx'))

// Loading fallback component
const LoadingFallback = () => (
  <div style={{
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-dark)',
    color: 'var(--color-primary)',
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '50px',
        height: '50px',
        border: '3px solid var(--color-primary)',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 20px',
      }} />
      <div style={{ fontSize: '14px', opacity: 0.8 }}>Loading...</div>
    </div>
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorProvider>
      <BrowserRouter>
        <div style={{ 
          position: 'relative',
          minHeight: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/watcherz" element={<PlaneWatcherz />} />
              <Route path="/trackerz" element={<PlaneTrackerz />} />
              <Route path="/alertz-watch" element={<PlaneAlertzWatch />} />
            </Routes>
          </Suspense>
          <Navigation />
        </div>
      </BrowserRouter>
    </ColorProvider>
  </StrictMode>,
)
