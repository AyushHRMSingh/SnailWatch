import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import PlaneWatcherz from './pages/PlaneWatcherz.tsx'
import PlaneTrackerz from './pages/PlaneTrackerz.tsx'
import WearOS from './pages/WearOS.tsx'
import Navigation from './components/Navigation.tsx'
import { ColorProvider } from './context/ColorContext.tsx'
import { WearOSDetector } from './utils/wearOsDetector'

// Component to handle WearOS redirect
function WearOSRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only redirect if not already on /wearos
    if (location.pathname !== '/wearos' && WearOSDetector.shouldRedirectToWearOS()) {
      navigate('/wearos', { replace: true });
    }
  }, [navigate, location.pathname]);

  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorProvider>
      <BrowserRouter>
        <WearOSRedirect />
        <Navigation />
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/watcherz" element={<PlaneWatcherz />} />
          <Route path="/trackerz" element={<PlaneTrackerz />} />
          <Route path="/wearos" element={<WearOS />} />
        </Routes>
      </BrowserRouter>
    </ColorProvider>
  </StrictMode>,
)
