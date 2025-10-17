import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, Radio, Volume2, VolumeX, RefreshCw, MapPin, AlertCircle } from 'lucide-react';
import { useColors } from '../context/ColorContext';
import { getDeviceInfo, logDeviceInfo } from '../utils/deviceDetection';
import './PlaneAlertzWatch.css';

// ===== CONFIGURABLE TIMERS =====
const FETCH_INTERVAL_MS = 2500;
const REFRESH_INTERVAL = 10;
// ===============================

interface Aircraft {
  hex: string;
  r: string;
  t: string;
  desc?: string;
  flight?: string;
  lat: number;
  lon: number;
  alt_baro: number | 'ground';
  gs: number;
  mach?: number;
  track?: number;
  calc_track?: number;
  dir?: number;
}

interface AircraftDetail {
  ICAO: string;
  Registration: string;
  Manufacturer: string;
  Type: string;
  RegisteredOwners: string;
  Callsign?: string;
  Altitude?: number | 'ground';
  Speed?: number;
  error?: string;
  Origin?: {
    name: string;
    iata_code: string;
    municipality: string;
    country_name: string;
  };
  Destination?: {
    name: string;
    iata_code: string;
    municipality: string;
    country_name: string;
  };
  Airline?: {
    name: string;
    iata: string;
    country: string;
  };
}

function PlaneAlertzWatch() {
  const { currentColors } = useColors();
  const navigate = useNavigate();
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraftDetail, setSelectedAircraftDetail] = useState<AircraftDetail | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [radius, setRadius] = useState(() => localStorage.getItem('watchRadius') || '10');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('watchSoundEnabled') !== 'false');
  const [isRoundScreen, setIsRoundScreen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(() => getDeviceInfo());
  const [showDeviceWarning, setShowDeviceWarning] = useState(false);
  
  const previousAircraft = useRef(new Set<string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fetchCounter = useRef(0);
  const redirectTimeout = useRef<number | null>(null);

  // Device detection and redirect logic
  useEffect(() => {
    const info = getDeviceInfo();
    setDeviceInfo(info);
    
    // Log device info for debugging
    logDeviceInfo();
    
    // If not a wearable device, show warning and redirect
    if (!info.isWearable) {
      console.warn('⚠️ Watch OS version accessed from non-wearable device');
      setShowDeviceWarning(true);
      
      // Auto-redirect after 5 seconds
      redirectTimeout.current = window.setTimeout(() => {
        if (info.isMobile) {
          navigate('/');
        } else if (info.isTablet || info.isDesktop) {
          navigate('/trackerz');
        } else {
          navigate('/');
        }
      }, 5000);
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (redirectTimeout.current) {
        clearTimeout(redirectTimeout.current);
      }
    };
  }, [navigate]);

  // Detect screen shape (round vs square)
  useEffect(() => {
    const detectScreenShape = () => {
      const info = getDeviceInfo();
      setIsRoundScreen(info.isRoundScreen);
    };
    
    detectScreenShape();
    window.addEventListener('resize', detectScreenShape);
    return () => window.removeEventListener('resize', detectScreenShape);
  }, []);

  const fetchAircraftDetails = async (hex: string, callsign?: string, altitude?: number | 'ground', mach?: number, groundSpeed?: number, aircraftData?: Aircraft) => {
    let speedKmh: number | undefined;
    if (mach) {
      speedKmh = Math.round(mach * 1234.8);
    } else if (groundSpeed) {
      speedKmh = Math.round(groundSpeed * 1.852);
    }
    
    if (aircraftData) {
      const defaultDetails: AircraftDetail = {
        ICAO: hex,
        Registration: aircraftData.r || hex,
        Manufacturer: 'Loading...',
        Type: aircraftData.desc || aircraftData.t || 'Unknown',
        RegisteredOwners: 'Loading...',
        Callsign: callsign,
        Altitude: altitude,
        Speed: speedKmh,
      };
      
      setIsRevealing(true);
      setSelectedAircraftDetail(defaultDetails);
      setTimeout(() => setIsRevealing(false), 1000);
    }
    
    try {
      const url = callsign 
        ? `https://api.adsbdb.com/v0/aircraft/${hex}?callsign=${callsign.trim()}`
        : `https://api.adsbdb.com/v0/aircraft/${hex}`;
      const adsbRes = await fetch(url);
      if (adsbRes.ok) {
        const adsbData = await adsbRes.json();
        const aircraft = adsbData.response?.aircraft;
        const flightroute = adsbData.response?.flightroute;
        
        if (aircraft) {
          const details: AircraftDetail = {
            ICAO: hex,
            Registration: aircraft.registration || hex,
            Manufacturer: aircraft.manufacturer || 'Unknown',
            Type: aircraft.type || aircraft.icao_type || 'Unknown',
            RegisteredOwners: aircraft.registered_owner || 'Unknown',
            Callsign: callsign,
            Altitude: altitude,
            Speed: speedKmh,
          };
          
          if (flightroute) {
            if (flightroute.origin) {
              details.Origin = {
                name: flightroute.origin.name,
                iata_code: flightroute.origin.iata_code,
                municipality: flightroute.origin.municipality,
                country_name: flightroute.origin.country_name,
              };
            }
            if (flightroute.destination) {
              details.Destination = {
                name: flightroute.destination.name,
                iata_code: flightroute.destination.iata_code,
                municipality: flightroute.destination.municipality,
                country_name: flightroute.destination.country_name,
              };
            }
            if (flightroute.airline) {
              details.Airline = {
                name: flightroute.airline.name,
                iata: flightroute.airline.iata,
                country: flightroute.airline.country,
              };
            }
          }
          
          setSelectedAircraftDetail(details);
        }
      }
    } catch (err) {
      console.error('Error fetching aircraft details:', err);
    }
  };

  const fetchData = async () => {
    if (!userLocation) return;
    
    fetchCounter.current += 1;
    const shouldCheckNewPlanes = fetchCounter.current % REFRESH_INTERVAL === 0;
    
    try {
      const url = `/api/lat/${userLocation.lat}/lon/${userLocation.lon}/dist/${radius}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const currentAircraft: Aircraft[] = data.aircraft || [];

      setAircraft(currentAircraft);

      if (shouldCheckNewPlanes) {
        setCountdown(REFRESH_INTERVAL);
        const currentHexCodes = new Set(currentAircraft.map(ac => ac.hex));
        const newEntries = currentAircraft.filter(ac => !previousAircraft.current.has(ac.hex) && ac.r);
        
        if (newEntries.length > 0) {
          const newAircraft = newEntries[0];
          fetchAircraftDetails(
            newAircraft.hex.replace('~', ''),
            newAircraft.flight?.trim(),
            newAircraft.alt_baro,
            newAircraft.mach,
            newAircraft.gs,
            newAircraft
          );
          
          setTimeout(() => {
            if (audioRef.current && soundEnabled) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(err => console.log('Audio play failed:', err));
            }
          }, 200);
        }

        previousAircraft.current = currentHexCodes;
      }
    } catch (err) {
      console.error('Error fetching aircraft:', err);
    }
  };

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
        },
        () => {
          setUserLocation({ lat: 33.9416, lon: -118.4085 });
        }
      );
    } else {
      setUserLocation({ lat: 33.9416, lon: -118.4085 });
    }
  }, []);

  useEffect(() => {
    if (!userLocation) return;
    fetchData();
    const interval = setInterval(fetchData, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userLocation, radius]);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const containerStyle: React.CSSProperties = {
    width: '100vw',
    minHeight: '100vh',
    background: '#000000', // True black for OLED
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible', // Allow scrolling to navigation
    padding: 0,
  };

  const cardStyle: React.CSSProperties = {
    width: 'min(90vw, 90vh)',
    height: 'min(90vw, 90vh)',
    aspectRatio: '1',
    background: `linear-gradient(135deg, #0a0a0a 0%, #000000 100%)`,
    borderRadius: isRoundScreen ? '50%' : 'clamp(1.25rem, 5vw, 2.5rem)',
    border: `clamp(2px, 0.5vw, 3px) solid ${currentColors.primary}`,
    boxShadow: `0 0 clamp(1.5rem, 7vw, 3rem) ${currentColors.shadow}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isRoundScreen ? '15%' : 'clamp(1rem, 4vw, 2rem)',
    position: 'relative',
    boxSizing: 'border-box',
  };

  const formatAltitude = (alt: number | 'ground' | undefined) => {
    if (alt === 'ground') return 'GROUND';
    if (alt === undefined) return 'N/A';
    return `${Math.round(alt).toLocaleString()} ft`;
  };

  const formatSpeed = (speed: number | undefined) => {
    if (speed === undefined) return 'N/A';
    return `${speed} km/h`;
  };

  return (
    <div className="watch-container" style={containerStyle}>
      <audio ref={audioRef} src="/sonar.mp3" preload="auto" />

      {/* Device Warning for Non-Wearables */}
      {showDeviceWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `${currentColors.bgDark}f8`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
          padding: '20px',
        }}>
          <div style={{
            background: currentColors.background,
            borderRadius: '20px',
            border: `3px solid ${currentColors.primary}`,
            padding: '30px',
            maxWidth: '500px',
            textAlign: 'center',
            boxShadow: `0 0 40px ${currentColors.shadow}`,
          }}>
            <AlertCircle 
              size={60} 
              color={currentColors.primary} 
              strokeWidth={2.5}
              style={{ marginBottom: '20px' }}
            />
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: currentColors.primary,
              marginBottom: '15px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}>
              Watch OS Only
            </h2>
            
            <p style={{
              fontSize: '16px',
              color: currentColors.secondary,
              marginBottom: '20px',
              lineHeight: '1.6',
            }}>
              This version is optimized for smartwatches and wearable devices.
              {deviceInfo.isDesktop && ' You\'re on a desktop computer.'}
              {deviceInfo.isTablet && ' You\'re on a tablet.'}
              {deviceInfo.isMobile && ' You\'re on a mobile phone.'}
            </p>

            <p style={{
              fontSize: '14px',
              color: currentColors.secondary,
              opacity: 0.7,
              marginBottom: '25px',
            }}>
              Redirecting to the appropriate version in 5 seconds...
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
                  navigate('/');
                }}
                style={{
                  padding: '12px 24px',
                  background: currentColors.primary,
                  color: currentColors.bgDark,
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Go to Alerts
              </button>
              
              <button
                onClick={() => {
                  if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
                  navigate('/trackerz');
                }}
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  color: currentColors.primary,
                  border: `2px solid ${currentColors.primary}`,
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Go to Tracker
              </button>

              <button
                onClick={() => {
                  if (redirectTimeout.current) clearTimeout(redirectTimeout.current);
                  setShowDeviceWarning(false);
                }}
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  color: currentColors.secondary,
                  border: `2px solid ${currentColors.secondary}`,
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  opacity: 0.7,
                }}
              >
                Continue Anyway
              </button>
            </div>

            <p style={{
              fontSize: '12px',
              color: currentColors.secondary,
              opacity: 0.5,
              marginTop: '20px',
            }}>
              Device: {deviceInfo.isDesktop ? 'Desktop' : deviceInfo.isTablet ? 'Tablet' : deviceInfo.isMobile ? 'Mobile' : 'Unknown'} • 
              Screen: {deviceInfo.viewport.width}x{deviceInfo.viewport.height}
            </p>
          </div>
        </div>
      )}

      {/* Reveal Animation */}
      {isRevealing && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `${currentColors.bgDark}f0`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          animation: 'fadeIn 0.3s ease-out',
        }}>
          <div style={{ textAlign: 'center' }}>
            <Radio size={60} color={currentColors.primary} strokeWidth={3} style={{ 
              marginBottom: '10px',
              filter: `drop-shadow(0 0 20px ${currentColors.shadow})`,
              animation: 'pulse 1s infinite'
            }} />
            <div style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color: currentColors.primary,
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}>
              NEW AIRCRAFT
            </div>
          </div>
        </div>
      )}

      {/* Settings Overlay */}
      {showSettings && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `${currentColors.bgDark}f5`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
        }}>
          <div style={{
            background: currentColors.background,
            borderRadius: isRoundScreen ? '50%' : '20px',
            border: `2px solid ${currentColors.primary}`,
            padding: isRoundScreen ? '30px 20px' : '20px',
            width: isRoundScreen ? '80%' : '90%',
            maxWidth: '300px',
            aspectRatio: isRoundScreen ? '1' : 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '15px',
          }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: currentColors.primary,
              marginBottom: '10px',
            }}>
              SETTINGS
            </div>
            
            <div style={{ width: '100%', textAlign: 'center' }}>
              <label style={{ fontSize: '12px', color: currentColors.primary, display: 'block', marginBottom: '5px' }}>
                Range (NM)
              </label>
              <input
                type="number"
                value={radius}
                onChange={(e) => {
                  setRadius(e.target.value);
                  localStorage.setItem('watchRadius', e.target.value);
                }}
                style={{
                  width: '80px',
                  padding: '8px',
                  background: currentColors.bgDark,
                  border: `2px solid ${currentColors.primary}`,
                  borderRadius: '8px',
                  color: currentColors.primary,
                  fontSize: '14px',
                  textAlign: 'center',
                }}
              />
            </div>

            <button
              onClick={() => setShowSettings(false)}
              style={{
                marginTop: '10px',
                padding: '10px 20px',
                background: currentColors.primary,
                color: currentColors.bgDark,
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div className="watch-card" style={cardStyle}>
        {/* Top Controls - 48px minimum touch targets */}
        <div style={{
          position: 'absolute',
          top: isRoundScreen ? 'clamp(1.5rem, 6vw, 2rem)' : '1rem',
          right: isRoundScreen ? 'clamp(1.5rem, 6vw, 2rem)' : '1rem',
          display: 'flex',
          gap: 'clamp(0.5rem, 2vw, 0.75rem)',
        }}>
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              localStorage.setItem('watchSoundEnabled', (!soundEnabled).toString());
            }}
            style={{
              minWidth: '48px',
              minHeight: '48px',
              width: 'clamp(48px, 12vw, 56px)',
              height: 'clamp(48px, 12vw, 56px)',
              borderRadius: '50%',
              background: soundEnabled ? currentColors.primary : 'transparent',
              border: `clamp(2px, 0.5vw, 3px) solid ${currentColors.primary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {soundEnabled ? 
              <Volume2 size={Math.max(18, window.innerWidth * 0.05)} color={currentColors.bgDark} /> : 
              <VolumeX size={Math.max(18, window.innerWidth * 0.05)} color={currentColors.primary} />
            }
          </button>
        </div>

        <div style={{
          position: 'absolute',
          top: isRoundScreen ? 'clamp(1.5rem, 6vw, 2rem)' : '1rem',
          left: isRoundScreen ? 'clamp(1.5rem, 6vw, 2rem)' : '1rem',
        }}>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              minWidth: '48px',
              minHeight: '48px',
              width: 'clamp(48px, 12vw, 56px)',
              height: 'clamp(48px, 12vw, 56px)',
              borderRadius: '50%',
              background: 'transparent',
              border: `clamp(2px, 0.5vw, 3px) solid ${currentColors.primary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <RefreshCw size={Math.max(18, window.innerWidth * 0.05)} color={currentColors.primary} />
          </button>
        </div>

        {/* Content */}
        {selectedAircraftDetail ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            width: '100%',
            height: '100%',
            gap: '8px',
          }}>
            <Plane 
              size={Math.max(35, Math.min(window.innerWidth * 0.1, 50))} 
              color={currentColors.primary} 
              strokeWidth={2.5}
              style={{ 
                marginBottom: 'clamp(0.3rem, 1.5vw, 0.5rem)',
                filter: `drop-shadow(0 0 clamp(0.5rem, 2.5vw, 1rem) ${currentColors.shadow})`
              }}
            />
            
            <div style={{
              fontSize: 'clamp(1rem, 4.5vw, 1.25rem)',
              fontWeight: 'bold',
              color: currentColors.primary,
              letterSpacing: '0.05em',
              lineHeight: 1.2,
            }}>
              {selectedAircraftDetail.Callsign || selectedAircraftDetail.Registration}
            </div>

            <div style={{
              fontSize: 'clamp(0.75rem, 3vw, 0.875rem)',
              color: currentColors.secondary,
              opacity: 0.8,
              maxWidth: '90%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.3,
            }}>
              {selectedAircraftDetail.Type}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'clamp(0.5rem, 2.5vw, 0.75rem)',
              marginTop: 'clamp(0.5rem, 2.5vw, 0.75rem)',
              width: '100%',
            }}>
              <div style={{
                background: `${currentColors.bgDark}80`,
                padding: 'clamp(0.5rem, 2vw, 0.625rem)',
                borderRadius: 'clamp(0.5rem, 2vw, 0.625rem)',
                border: `1px solid ${currentColors.primary}40`,
              }}>
                <div style={{ fontSize: 'clamp(0.625rem, 2.5vw, 0.75rem)', color: currentColors.secondary, opacity: 0.6, marginBottom: '0.125rem', lineHeight: 1.2 }}>
                  ALT
                </div>
                <div style={{ fontSize: 'clamp(0.8rem, 3.3vw, 0.95rem)', fontWeight: 'bold', color: currentColors.primary, lineHeight: 1.2 }}>
                  {formatAltitude(selectedAircraftDetail.Altitude)}
                </div>
              </div>

              <div style={{
                background: `${currentColors.bgDark}80`,
                padding: 'clamp(0.5rem, 2vw, 0.625rem)',
                borderRadius: 'clamp(0.5rem, 2vw, 0.625rem)',
                border: `1px solid ${currentColors.primary}40`,
              }}>
                <div style={{ fontSize: 'clamp(0.625rem, 2.5vw, 0.75rem)', color: currentColors.secondary, opacity: 0.6, marginBottom: '0.125rem', lineHeight: 1.2 }}>
                  SPEED
                </div>
                <div style={{ fontSize: 'clamp(0.8rem, 3.3vw, 0.95rem)', fontWeight: 'bold', color: currentColors.primary, lineHeight: 1.2 }}>
                  {formatSpeed(selectedAircraftDetail.Speed)}
                </div>
              </div>
            </div>

            {selectedAircraftDetail.Origin && selectedAircraftDetail.Destination && (
              <div style={{
                marginTop: 'clamp(0.4rem, 2vw, 0.6rem)',
                fontSize: 'clamp(0.7rem, 2.8vw, 0.85rem)',
                color: currentColors.secondary,
                opacity: 0.7,
                lineHeight: 1.3,
              }}>
                {selectedAircraftDetail.Origin.iata_code} → {selectedAircraftDetail.Destination.iata_code}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '15px',
          }}>
            <Radio 
              size={Math.max(40, Math.min(window.innerWidth * 0.12, 60))} 
              color={currentColors.primary} 
              strokeWidth={2}
              style={{ 
                filter: `drop-shadow(0 0 clamp(0.75rem, 3.5vw, 1.25rem) ${currentColors.shadow})`,
                animation: 'pulse 2s infinite'
              }}
            />
            
            <div style={{
              fontSize: 'clamp(0.875rem, 4vw, 1.125rem)',
              fontWeight: 'bold',
              color: currentColors.primary,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              lineHeight: 1.2,
            }}>
              SCANNING
            </div>

            <div style={{
              fontSize: 'clamp(0.75rem, 3vw, 0.875rem)',
              color: currentColors.secondary,
              opacity: 0.7,
              lineHeight: 1.3,
            }}>
              {aircraft.length} aircraft nearby
            </div>

            {countdown > 0 && (
              <div style={{
                fontSize: 'clamp(1.25rem, 6vw, 1.75rem)',
                fontWeight: 'bold',
                color: currentColors.primary,
                fontFamily: 'monospace',
                lineHeight: 1,
              }}>
                {countdown}s
              </div>
            )}
          </div>
        )}

        {/* Bottom Status */}
        <div style={{
          position: 'absolute',
          bottom: isRoundScreen ? 'clamp(1.5rem, 6vw, 2rem)' : '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(0.25rem, 1.2vw, 0.4rem)',
          fontSize: 'clamp(0.625rem, 2.5vw, 0.75rem)',
          color: currentColors.secondary,
          opacity: 0.6,
          lineHeight: 1,
        }}>
          <MapPin size={Math.max(12, window.innerWidth * 0.03)} />
          <span>{radius} NM</span>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }

        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}

export default PlaneAlertzWatch;
