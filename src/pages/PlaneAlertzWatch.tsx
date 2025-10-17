import { useState, useEffect, useRef } from 'react';
import { Plane, Radio, Volume2, VolumeX, RefreshCw, MapPin } from 'lucide-react';
import { useColors } from '../context/ColorContext';
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
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraftDetail, setSelectedAircraftDetail] = useState<AircraftDetail | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [radius, setRadius] = useState(() => localStorage.getItem('watchRadius') || '10');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('watchSoundEnabled') !== 'false');
  const [isRoundScreen, setIsRoundScreen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  const previousAircraft = useRef(new Set<string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fetchCounter = useRef(0);

  // Detect screen shape (round vs square)
  useEffect(() => {
    const detectScreenShape = () => {
      // Check if device has round screen characteristics
      // Round screens typically have width === height and are small
      const isRound = (window.innerWidth === window.innerHeight && window.innerWidth < 250) ||
                      window.matchMedia('(display-mode: standalone)').matches && 
                      Math.abs(window.innerWidth - window.innerHeight) < 10;
      setIsRoundScreen(isRound);
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
    height: '100vh',
    background: currentColors.background,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    padding: isRoundScreen ? '15%' : '10px',
  };

  const cardStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: `linear-gradient(135deg, ${currentColors.bgDark}ee, ${currentColors.background}dd)`,
    borderRadius: isRoundScreen ? '50%' : '20px',
    border: `3px solid ${currentColors.primary}`,
    boxShadow: `0 0 30px ${currentColors.shadow}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isRoundScreen ? '20px' : '15px',
    position: 'relative',
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
        {/* Top Controls */}
        <div style={{
          position: 'absolute',
          top: isRoundScreen ? '25px' : '15px',
          right: isRoundScreen ? '25px' : '15px',
          display: 'flex',
          gap: '8px',
        }}>
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              localStorage.setItem('watchSoundEnabled', (!soundEnabled).toString());
            }}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: soundEnabled ? currentColors.primary : 'transparent',
              border: `2px solid ${currentColors.primary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {soundEnabled ? 
              <Volume2 size={18} color={currentColors.bgDark} /> : 
              <VolumeX size={18} color={currentColors.primary} />
            }
          </button>
        </div>

        <div style={{
          position: 'absolute',
          top: isRoundScreen ? '25px' : '15px',
          left: isRoundScreen ? '25px' : '15px',
        }}>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'transparent',
              border: `2px solid ${currentColors.primary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={18} color={currentColors.primary} />
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
              size={isRoundScreen ? 40 : 35} 
              color={currentColors.primary} 
              strokeWidth={2.5}
              style={{ 
                marginBottom: '5px',
                filter: `drop-shadow(0 0 10px ${currentColors.shadow})`
              }}
            />
            
            <div style={{
              fontSize: isRoundScreen ? '18px' : '16px',
              fontWeight: 'bold',
              color: currentColors.primary,
              letterSpacing: '1px',
            }}>
              {selectedAircraftDetail.Callsign || selectedAircraftDetail.Registration}
            </div>

            <div style={{
              fontSize: isRoundScreen ? '12px' : '11px',
              color: currentColors.secondary,
              opacity: 0.8,
              maxWidth: '90%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {selectedAircraftDetail.Type}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              marginTop: '10px',
              width: '100%',
            }}>
              <div style={{
                background: `${currentColors.bgDark}80`,
                padding: '8px',
                borderRadius: '8px',
                border: `1px solid ${currentColors.primary}40`,
              }}>
                <div style={{ fontSize: '10px', color: currentColors.secondary, opacity: 0.6, marginBottom: '2px' }}>
                  ALTITUDE
                </div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: currentColors.primary }}>
                  {formatAltitude(selectedAircraftDetail.Altitude)}
                </div>
              </div>

              <div style={{
                background: `${currentColors.bgDark}80`,
                padding: '8px',
                borderRadius: '8px',
                border: `1px solid ${currentColors.primary}40`,
              }}>
                <div style={{ fontSize: '10px', color: currentColors.secondary, opacity: 0.6, marginBottom: '2px' }}>
                  SPEED
                </div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: currentColors.primary }}>
                  {formatSpeed(selectedAircraftDetail.Speed)}
                </div>
              </div>
            </div>

            {selectedAircraftDetail.Origin && selectedAircraftDetail.Destination && (
              <div style={{
                marginTop: '8px',
                fontSize: '11px',
                color: currentColors.secondary,
                opacity: 0.7,
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
              size={isRoundScreen ? 50 : 45} 
              color={currentColors.primary} 
              strokeWidth={2}
              style={{ 
                filter: `drop-shadow(0 0 15px ${currentColors.shadow})`,
                animation: 'pulse 2s infinite'
              }}
            />
            
            <div style={{
              fontSize: isRoundScreen ? '16px' : '14px',
              fontWeight: 'bold',
              color: currentColors.primary,
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}>
              SCANNING
            </div>

            <div style={{
              fontSize: isRoundScreen ? '12px' : '11px',
              color: currentColors.secondary,
              opacity: 0.7,
            }}>
              {aircraft.length} aircraft nearby
            </div>

            {countdown > 0 && (
              <div style={{
                fontSize: isRoundScreen ? '24px' : '20px',
                fontWeight: 'bold',
                color: currentColors.primary,
                fontFamily: 'monospace',
              }}>
                {countdown}s
              </div>
            )}
          </div>
        )}

        {/* Bottom Status */}
        <div style={{
          position: 'absolute',
          bottom: isRoundScreen ? '25px' : '15px',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '10px',
          color: currentColors.secondary,
          opacity: 0.6,
        }}>
          <MapPin size={12} />
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
