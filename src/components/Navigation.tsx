import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Radio, Eye, Navigation as NavIcon, Watch } from 'lucide-react';
import { useColors } from '../context/ColorContext';
import { getDeviceInfo } from '../utils/deviceDetection';

function Navigation() {
  const location = useLocation();
  const { currentColors } = useColors();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [deviceInfo] = useState(() => getDeviceInfo());

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Base navigation items
  const baseNavItems = [
    { path: '/', label: 'PlaneAlertz', icon: Radio },
    { path: '/watcherz', label: 'Plane Watcherz', icon: Eye },
    { path: '/trackerz', label: 'Plane Trackerz', icon: NavIcon },
  ];
  
  // Add Watch OS link with indicator for non-wearables
  const watchItem = { 
    path: '/alertz-watch', 
    label: deviceInfo.isWearable ? 'Watch OS' : 'Watch OS ⚠️', 
    icon: Watch,
    isWatchOnly: true
  };
  
  const navItems = [...baseNavItems, watchItem];

  return (
    <nav style={{
      position: 'absolute',
      top: '100vh', // Start below the viewport
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,
      display: 'flex',
      gap: '10px',
      background: currentColors.background,
      padding: '10px',
      marginTop: '40px', // Extra space below viewport
      marginBottom: '40px', // Space at bottom
      borderRadius: '12px',
      border: `2px solid ${currentColors.primary}`,
      boxShadow: `0 0 20px ${currentColors.shadow}`,
      flexWrap: 'wrap',
      justifyContent: 'center',
      maxWidth: 'calc(100vw - 40px)'
    }}>
      {navItems.map((item: any) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        const isWatchOnly = item.isWatchOnly || false;
        
        return (
          <Link
            key={item.path}
            to={item.path}
            title={isWatchOnly && !deviceInfo.isWearable ? 'Optimized for smartwatches - will show warning on other devices' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '10px 15px',
              color: isActive ? currentColors.bgDark : currentColors.primary,
              background: isActive ? currentColors.primary : 'transparent',
              textDecoration: 'none',
              borderRadius: '8px',
              border: `2px solid ${isActive ? currentColors.primary : 'transparent'}`,
              transition: 'all 0.3s ease',
              fontSize: '0.9rem',
              fontWeight: isActive ? 'bold' : 'normal',
              whiteSpace: 'nowrap',
              opacity: isWatchOnly && !deviceInfo.isWearable ? 0.7 : 1,
            }}
          >
            <Icon size={20} />
            {!isMobile && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export default Navigation;
