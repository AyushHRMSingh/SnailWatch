import { useState, useEffect, useRef } from 'react';
import { Settings, X, Volume2, VolumeX } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useColors } from '../context/ColorContext';
import { useNavigate } from 'react-router-dom';
import '../App.css';

// ===== CONFIGURABLE TIMERS =====
const FETCH_INTERVAL_MS = 2500;  // How often to fetch aircraft data (milliseconds)
const REFRESH_INTERVAL = 10;     // Check for new aircraft every N fetches (10 = every 25 seconds)
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


function PlaneWatcherz() {
  const { currentColors } = useColors();
  const navigate = useNavigate();
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [customLat, setCustomLat] = useState(() => localStorage.getItem('customLat') || '');
  const [customLon, setCustomLon] = useState(() => localStorage.getItem('customLon') || '');
  const [radius, setRadius] = useState(() => localStorage.getItem('radius') || '20');
  const [useCustomLocation, setUseCustomLocation] = useState(() => localStorage.getItem('useCustomLocation') === 'true');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false');
  const [dataSource, setDataSource] = useState<'adsb.fi' | 'airplanes.live'>(() => (localStorage.getItem('dataSource') as 'adsb.fi' | 'airplanes.live') || 'adsb.fi');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const previousAircraft = useRef(new Set<string>());
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const allMarkers = useRef<Map<string, maplibregl.Marker>>(new Map()); // Map hex -> marker
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousLocation = useRef<{ lat: number; lon: number } | null>(null);
  const previousRadius = useRef<string | null>(null);
  const fetchCounter = useRef(0);

  const searchLocation = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          const result = data[0];
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          setCustomLat(lat.toString());
          setCustomLon(lon.toString());
          setUseCustomLocation(true);
          localStorage.setItem('customLat', lat.toString());
          localStorage.setItem('customLon', lon.toString());
          localStorage.setItem('useCustomLocation', 'true');
          setSearchQuery('');
          
          // Force map to recreate with new location
          if (map.current) {
            map.current.remove();
            map.current = null;
          }
          allMarkers.current.clear();
          if (userMarker.current) {
            userMarker.current = null;
          }
        }
      }
    } catch (err) {
      console.error('Error searching location:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchData = async () => {
    if (!userLocation) return;
    
    fetchCounter.current += 1;
    const shouldCheckNewPlanes = fetchCounter.current % REFRESH_INTERVAL === 0;
    
    try {
      let url: string;
      let currentAircraft: Aircraft[] = [];
      
      if (dataSource === 'adsb.fi') {
        url = `/api/lat/${userLocation.lat}/lon/${userLocation.lon}/dist/${radius}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        currentAircraft = data.aircraft || [];
      } else if (dataSource === 'airplanes.live') {
        url = `https://api.airplanes.live/v2/point/${userLocation.lat}/${userLocation.lon}/${radius}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        currentAircraft = (data.ac || []).map((plane: any) => ({
          hex: plane.hex,
          r: plane.r || '',
          t: plane.t || plane.type || '',
          desc: plane.desc,
          flight: plane.flight,
          lat: plane.lat,
          lon: plane.lon,
          alt_baro: plane.alt_baro,
          gs: plane.gs,
          mach: plane.mach,
          track: plane.track,
          calc_track: plane.calc_track,
          dir: plane.dir
        }));
      }

      setAircraft(currentAircraft);

      if (shouldCheckNewPlanes) {
        setCountdown(REFRESH_INTERVAL);
        const currentHexCodes = new Set(currentAircraft.map(ac => ac.hex));
        const newEntries = currentAircraft.filter(ac => !previousAircraft.current.has(ac.hex) && ac.r);
        
        if (newEntries.length > 0 && audioRef.current && soundEnabled) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(err => console.log('Audio play failed:', err));
        }
        
        previousAircraft.current = currentHexCodes;
      }
    } catch (err) {
      console.error('Error fetching aircraft:', err);
    }
  };


  // Get user location
  useEffect(() => {
    if (useCustomLocation && customLat && customLon) {
      const lat = parseFloat(customLat);
      const lon = parseFloat(customLon);
      if (!isNaN(lat) && !isNaN(lon)) {
        setUserLocation({ lat, lon });
        return;
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => {
          console.error('Geolocation error:', error.message);
        }
      );
    } else {
      console.error('Geolocation not supported');
    }
  }, [useCustomLocation, customLat, customLon]);

  // Fetch data interval
  useEffect(() => {
    if (!userLocation) return;
    
    fetchData();
    const interval = setInterval(fetchData, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userLocation, radius, dataSource]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => setCountdown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize map (once)
  useEffect(() => {
    if (!mapContainer.current || !userLocation) return;
    if (map.current) return; // Don't recreate if map already exists

    previousLocation.current = { lat: userLocation.lat, lon: userLocation.lon };
    previousRadius.current = radius;

    const radiusInMeters = parseFloat(radius) * 1852;
    const latDelta = (radiusInMeters / 111320);
    const lonDelta = (radiusInMeters / (111320 * Math.cos(userLocation.lat * Math.PI / 180)));
    
    const bounds: [[number, number], [number, number]] = [
      [userLocation.lon - lonDelta, userLocation.lat - latDelta],
      [userLocation.lon + lonDelta, userLocation.lat + latDelta]
    ];

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: '/style.json',
      bounds: bounds,
      fitBoundsOptions: { padding: 0 }
    });

    map.current = mapInstance;

    mapInstance.on('load', () => {
      const radiusInMeters = parseFloat(radius) * 1852;
      const points = 64;
      const coords: [number, number][] = [];
      
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * 2 * Math.PI;
        const dx = radiusInMeters * Math.cos(angle);
        const dy = radiusInMeters * Math.sin(angle);
        const deltaLat = dy / 111320;
        const deltaLon = dx / (111320 * Math.cos(userLocation.lat * Math.PI / 180));
        coords.push([userLocation.lon + deltaLon, userLocation.lat + deltaLat]);
      }
      coords.push(coords[0]);

      mapInstance.addSource('scanner-range', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] },
          properties: {}
        }
      });

      mapInstance.addLayer({
        id: 'scanner-range-fill',
        type: 'fill',
        source: 'scanner-range',
        paint: { 'fill-color': currentColors.primary, 'fill-opacity': 0.1 }
      });

      mapInstance.addLayer({
        id: 'scanner-range-outline',
        type: 'line',
        source: 'scanner-range',
        paint: { 'line-color': currentColors.primary, 'line-width': 2, 'line-opacity': 0.8 }
      });

      // User marker
      const userMarkerEl = document.createElement('div');
      userMarkerEl.innerHTML = '📍';
      userMarkerEl.style.fontSize = '24px';
      userMarker.current = new maplibregl.Marker({ element: userMarkerEl })
        .setLngLat([userLocation.lon, userLocation.lat])
        .addTo(mapInstance);
    });
  }, [userLocation, radius, currentColors]);

  // Update markers
  useEffect(() => {
    if (!map.current) return;

    const currentHexes = new Set(aircraft.map(ac => ac.hex));
    
    // Remove markers for aircraft that are no longer present
    allMarkers.current.forEach((marker, hex) => {
      if (!currentHexes.has(hex)) {
        marker.remove();
        allMarkers.current.delete(hex);
      }
    });

    // Update or create markers for each aircraft
    aircraft.forEach((plane) => {
      const existingMarker = allMarkers.current.get(plane.hex);
      const isSelected = selectedAircraft && plane.hex === selectedAircraft.hex;
      const heading = plane.track ?? plane.dir ?? plane.calc_track;
      const rotation = heading !== undefined ? heading : 0;

      if (existingMarker) {
        // Update existing marker
        existingMarker.setLngLat([plane.lon, plane.lat]);
        existingMarker.setRotation(rotation);
        
        // Update marker appearance if selection changed
        const el = existingMarker.getElement();
        el.style.width = isSelected ? '40px' : '32px';
        el.style.height = isSelected ? '40px' : '32px';
        el.style.backgroundImage = isSelected ? 'url(/KL.svg)' : 'url(/plane.png)';
        el.style.zIndex = isSelected ? '1000' : '1';
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.style.width = isSelected ? '40px' : '32px';
        el.style.height = isSelected ? '40px' : '32px';
        el.style.cursor = 'pointer';
        el.style.backgroundImage = isSelected ? 'url(/KL.svg)' : 'url(/plane.png)';
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
        el.style.transformOrigin = 'center center';
        el.style.zIndex = isSelected ? '1000' : '1';
        
        el.onclick = () => setSelectedAircraft(plane);

        const marker = new maplibregl.Marker({ element: el, rotation: rotation, rotationAlignment: 'map' })
          .setLngLat([plane.lon, plane.lat])
          .addTo(map.current!);
        
        allMarkers.current.set(plane.hex, marker);
      }
    });
  }, [aircraft, selectedAircraft]);

  // Update selected aircraft with live data
  useEffect(() => {
    if (!selectedAircraft) return;

    const currentPlane = aircraft.find(plane => plane.hex === selectedAircraft.hex);
    if (currentPlane) {
      // Update selectedAircraft with latest data
      setSelectedAircraft(currentPlane);
    }
  }, [aircraft]);

  return (
    <div className="App">
      <div className="radar-bg"></div>
      <audio ref={audioRef} src="/sonar.mp3" preload="auto" />

      {/* Settings Button */}
      <button 
        className="settings-button"
        onClick={() => setShowSettings(!showSettings)}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10001,
          background: currentColors.background,
          border: `2px solid ${currentColors.primary}`,
          color: currentColors.primary,
          padding: '10px',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        {showSettings ? <X size={24} /> : <Settings size={24} />}
      </button>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-popup" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            
            <div className="settings-section">
              <label>
                <input 
                  type="checkbox"
                  checked={useCustomLocation}
                  onChange={(e) => setUseCustomLocation(e.target.checked)}
                />
                Use Custom Location
              </label>
            </div>

            {useCustomLocation && (
              <>
                <div className="settings-section">
                  <label>Latitude</label>
                  <input 
                    type="text" 
                    value={customLat}
                    onChange={(e) => setCustomLat(e.target.value)}
                    placeholder="e.g., 40.7128"
                    className="settings-input"
                  />
                </div>
                <div className="settings-section">
                  <label>Longitude</label>
                  <input 
                    type="text" 
                    value={customLon}
                    onChange={(e) => setCustomLon(e.target.value)}
                    placeholder="e.g., -74.0060"
                    className="settings-input"
                  />
                </div>
              </>
            )}

            <div className="settings-section">
              <label>Scanner Radius (NM)</label>
              <input 
                type="text" 
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                placeholder="e.g., 20"
                className="settings-input"
              />
            </div>

            <div className="settings-section">
              <label>Data Source</label>
              <div className="color-mode-buttons">
                <button
                  className={`color-mode-button ${dataSource === 'adsb.fi' ? 'active' : ''}`}
                  onClick={() => {
                    setDataSource('adsb.fi');
                    localStorage.setItem('dataSource', 'adsb.fi');
                  }}
                >
                  adsb.fi
                </button>
                <button
                  className={`color-mode-button ${dataSource === 'airplanes.live' ? 'active' : ''}`}
                  onClick={() => {
                    setDataSource('airplanes.live');
                    localStorage.setItem('dataSource', 'airplanes.live');
                  }}
                >
                  airplanes.live
                </button>
              </div>
            </div>

            <button 
              className="apply-button"
              onClick={() => {
                localStorage.setItem('customLat', customLat);
                localStorage.setItem('customLon', customLon);
                localStorage.setItem('radius', radius);
                localStorage.setItem('useCustomLocation', useCustomLocation.toString());
                
                if (useCustomLocation && customLat && customLon) {
                  const lat = parseFloat(customLat);
                  const lon = parseFloat(customLon);
                  if (!isNaN(lat) && !isNaN(lon)) {
                    setUserLocation({ lat, lon });
                  } else {
                    console.error('Invalid coordinates');
                  }
                } else {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (position) => {
                        setUserLocation({
                          lat: position.coords.latitude,
                          lon: position.coords.longitude
                        });
                      },
                      (error) => console.error('Geolocation error:', error.message)
                    );
                  }
                }
                setShowSettings(false);
              }}
            >
              Apply Settings
            </button>
          </div>
        </div>
      )}

      {/* Sound Toggle */}
      <button
        onClick={() => setSoundEnabled(!soundEnabled)}
        style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          zIndex: 10001,
          background: currentColors.background,
          border: `2px solid ${currentColors.primary}`,
          color: currentColors.primary,
          padding: '10px',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        {soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
      </button>

      {/* Map Container */}
      <div ref={mapContainer} style={{ 
        width: '100vw', 
        height: '100vh',
        position: 'absolute',
        top: 0,
        left: 0
      }} />

      {/* Info Panel */}
      {selectedAircraft && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          left: '20px',
          background: currentColors.background,
          border: `2px solid ${currentColors.primary}`,
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '400px',
          zIndex: 10000,
          color: currentColors.primary
        }}>
          <button
            onClick={() => setSelectedAircraft(null)}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'transparent',
              border: 'none',
              color: currentColors.primary,
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>

          <h3 style={{ marginTop: 0 }}>Aircraft Info</h3>
          
          {selectedAircraft.flight && (
            <p><strong>Flight:</strong> {selectedAircraft.flight.trim()}</p>
          )}
          {selectedAircraft.r && (
            <p><strong>Registration:</strong> {selectedAircraft.r}</p>
          )}
          {selectedAircraft.t && (
            <p><strong>Type:</strong> {selectedAircraft.t}</p>
          )}
          {selectedAircraft.hex && (
            <p><strong>ICAO:</strong> {selectedAircraft.hex.replace('~', '').toUpperCase()}</p>
          )}
          {selectedAircraft.alt_baro !== undefined && (
            <p><strong>Altitude:</strong> {selectedAircraft.alt_baro === 'ground' ? 'On Ground' : `${Math.round(selectedAircraft.alt_baro as number)} ft`}</p>
          )}
          {selectedAircraft.gs !== undefined && (
            <p><strong>Speed:</strong> {Math.round(selectedAircraft.gs * 1.852)} km/h</p>
          )}
          {(selectedAircraft.track ?? selectedAircraft.dir) !== undefined && (
            <p><strong>Heading:</strong> {Math.round(selectedAircraft.track ?? selectedAircraft.dir ?? 0)}°</p>
          )}
          
          <button
            onClick={() => {
              // Navigate to Trackerz with aircraft data and last known position
              navigate('/trackerz', { 
                state: { 
                  aircraft: selectedAircraft,
                  searchLat: selectedAircraft.lat,
                  searchLon: selectedAircraft.lon
                } 
              });
            }}
            style={{
              width: '100%',
              marginTop: '15px',
              padding: '10px',
              background: currentColors.primary,
              color: currentColors.bgDark,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem'
            }}
          >
            Track Aircraft
          </button>
        </div>
      )}

      {/* Status Bar */}
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        background: currentColors.background,
        border: `2px solid ${currentColors.primary}`,
        borderRadius: '8px',
        padding: '10px 20px',
        color: currentColors.primary,
        zIndex: 10000
      }}>
        <div>⏱ {countdown}s | Tracking: {aircraft.length}</div>
      </div>

      {/* Search Bar */}
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '400px',
        maxWidth: '90vw',
        zIndex: 10000
      }}>
        <div style={{
          position: 'relative',
          background: currentColors.background,
          border: `2px solid ${currentColors.primary}`,
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: `0 0 20px ${currentColors.shadow}`
        }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                searchLocation();
              }
            }}
            placeholder="🔍 Search location (press Enter)..."
            style={{
              width: '100%',
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              color: currentColors.primary,
              fontSize: '1rem',
              outline: 'none',
              fontFamily: 'inherit'
            }}
          />
          {isSearching && (
            <div style={{
              position: 'absolute',
              right: '15px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: currentColors.primary,
              opacity: 0.7,
              fontSize: '0.9rem'
            }}>
              Searching...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlaneWatcherz;
