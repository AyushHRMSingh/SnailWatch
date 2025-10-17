import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Radio, Eye, Navigation as NavIcon, Watch } from 'lucide-react';
import { useColors } from '../context/ColorContext';

function Navigation() {
  const location = useLocation();
  const { currentColors } = useColors();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const navItems = [
    { path: '/', label: 'PlaneAlertz', icon: Radio },
    { path: '/watcherz', label: 'Plane Watcherz', icon: Eye },
    { path: '/trackerz', label: 'Plane Trackerz', icon: NavIcon },
    { path: '/alertz-watch', label: 'Watch OS', icon: Watch },
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,
      display: 'flex',
      gap: '10px',
      background: currentColors.background,
      padding: '10px',
      borderRadius: '12px',
      border: `2px solid ${currentColors.primary}`,
      boxShadow: `0 0 20px ${currentColors.shadow}`,
      flexWrap: 'wrap',
      justifyContent: 'center',
      maxWidth: 'calc(100vw - 40px)'
    }}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        
        return (
          <Link
            key={item.path}
            to={item.path}
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
              whiteSpace: 'nowrap'
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
