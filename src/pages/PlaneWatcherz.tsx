import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, X, Volume2, VolumeX, Filter } from 'lucide-react';
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

interface PlaneModel {
  plane_name: string;
  regex: string[];
  photo_url: string;
}

interface PlaneManufacturer {
  manufacturer_name: string;
  models: PlaneModel[];
}

interface PlanesDatabase {
  planes: PlaneManufacturer[];
}


function PlaneWatcherz() {
  const { currentColors } = useColors();
  const navigate = useNavigate();
  const [allAircraft, setAllAircraft] = useState<Aircraft[]>([]); // Store ALL aircraft from API
  const [aircraft, setAircraft] = useState<Aircraft[]>([]); // Filtered aircraft for display
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
  const [showNonStandardADSB, setShowNonStandardADSB] = useState(() => localStorage.getItem('showNonStandardADSB') === 'true');
  const [devMode, setDevMode] = useState(() => localStorage.getItem('devMode') === 'true');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [planesDatabase, setPlanesDatabase] = useState<PlanesDatabase | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedPlaneFilters, setSelectedPlaneFilters] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('selectedPlaneFilters');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const OTHERS_FILTER = '__OTHERS__';

  const previousAircraft = useRef(new Set<string>());
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const allMarkers = useRef<Map<string, maplibregl.Marker>>(new Map()); // Map hex -> marker
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousLocation = useRef<{ lat: number; lon: number } | null>(null);
  const previousRadius = useRef<string | null>(null);
  const fetchCounter = useRef(0);

  // Function to check if aircraft matches ANY of the selected filters
  const matchesFilter = (aircraft: Aircraft): boolean => {
    if (selectedPlaneFilters.size === 0 || !planesDatabase) return true;
    
    const aircraftType = aircraft.t || aircraft.desc || '';
    let matchedAnyKnownPlane = false;
    
    // Check if aircraft matches ANY of the selected plane models
    for (const manufacturer of planesDatabase.planes) {
      for (const model of manufacturer.models) {
        const matches = model.regex.some(pattern => {
          try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(aircraftType);
          } catch (e) {
            console.error('Invalid regex pattern:', pattern);
            return false;
          }
        });
        
        if (matches) {
          matchedAnyKnownPlane = true;
          if (selectedPlaneFilters.has(model.plane_name)) {
            return true;
          }
        }
      }
    }
    
    if (!matchedAnyKnownPlane && selectedPlaneFilters.has(OTHERS_FILTER)) {
      return true;
    }
    
    return false;
  };

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

  const fetchData = useCallback(async () => {
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

      // Store ALL aircraft from API
      setAllAircraft(currentAircraft);

      if (shouldCheckNewPlanes) {
        setCountdown(REFRESH_INTERVAL);
        const newEntries = currentAircraft.filter(ac => !previousAircraft.current.has(ac.hex) && ac.r);
        
        if (newEntries.length > 0 && audioRef.current && soundEnabled) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(err => console.log('Audio play failed:', err));
        }
        
        // Update with all aircraft hex codes
        const currentHexCodes = new Set(currentAircraft.map(ac => ac.hex));
        previousAircraft.current = currentHexCodes;
      }
    } catch (err) {
      console.error('Error fetching aircraft:', err);
    }
  }, [userLocation, radius, dataSource, soundEnabled]);


  // Load planes database
  useEffect(() => {
    fetch('/planes.json')
      .then(res => res.json())
      .then(data => {
        setPlanesDatabase(data);
        console.log('✓ Planes database loaded');
      })
      .catch(err => {
        console.error('Failed to load planes database:', err);
      });
  }, []);

  // Filter aircraft whenever allAircraft, selectedPlaneFilters, or showNonStandardADSB changes
  useEffect(() => {
    let filtered = allAircraft;
    
    // First filter by data source type if needed
    if (!showNonStandardADSB) {
      filtered = filtered.filter(ac => {
        const type = ac.t || '';
        return !type.includes('tisb') && !type.includes('adsr') && !type.includes('mlat');
      });
    }
    
    // Then apply plane model filters
    if (selectedPlaneFilters.size > 0 && planesDatabase) {
      filtered = filtered.filter(matchesFilter);
      setAircraft(filtered);
      console.log(`Filtered ${filtered.length} aircraft out of ${allAircraft.length} (filters: ${Array.from(selectedPlaneFilters).join(', ')}, non-standard: ${showNonStandardADSB})`);
    } else {
      setAircraft(filtered);
      console.log(`Showing ${filtered.length} aircraft out of ${allAircraft.length} (non-standard: ${showNonStandardADSB})`);
    }
  }, [allAircraft, selectedPlaneFilters, planesDatabase, showNonStandardADSB]);

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
  }, [userLocation, radius, dataSource, fetchData]);

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
        el.style.backgroundImage = isSelected ? 'url(/blank_plane.png)' : 'url(/blank_plane.png)';
        el.style.zIndex = isSelected ? '1000' : '1';
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.style.width = isSelected ? '40px' : '32px';
        el.style.height = isSelected ? '40px' : '32px';
        el.style.cursor = 'pointer';
        el.style.backgroundImage = isSelected ? 'url(/blank_plane.png)' : 'url(/blank_plane.png)';
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

            <div className="settings-section">
              <label>
                <input 
                  type="checkbox"
                  checked={showNonStandardADSB}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setShowNonStandardADSB(newValue);
                    localStorage.setItem('showNonStandardADSB', newValue.toString());
                  }}
                />
                Show Non-Standard ADS-B (TIS-B, ADSR, MLAT)
              </label>
            </div>

            <div className="settings-section">
              <label>
                <input 
                  type="checkbox"
                  checked={devMode}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setDevMode(newValue);
                    localStorage.setItem('devMode', newValue.toString());
                  }}
                />
                Developer Mode (Show Type Code & Description)
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

      {/* Filter Button */}
      <button
        onClick={() => setShowFilter(!showFilter)}
        style={{
          position: 'fixed',
          top: '140px',
          right: '20px',
          zIndex: 10001,
          background: selectedPlaneFilters.size > 0 ? currentColors.primary : currentColors.background,
          border: `2px solid ${currentColors.primary}`,
          color: selectedPlaneFilters.size > 0 ? currentColors.bgDark : currentColors.primary,
          padding: '10px',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        <Filter size={24} />
        {selectedPlaneFilters.size > 0 && (
          <span style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            background: '#ff0000',
            color: '#fff',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
          }}>
            {selectedPlaneFilters.size}
          </span>
        )}
      </button>

      {/* Filter Modal */}
      {showFilter && (
        <div className="settings-overlay" onClick={() => setShowFilter(false)}>
          <div className="settings-popup" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="settings-header">
              <h2>FILTER PLANES ({selectedPlaneFilters.size} selected)</h2>
              <button className="close-button" onClick={() => setShowFilter(false)}>
                <X size={24} color={currentColors.primary} />
              </button>
            </div>
            
            <div className="settings-content">
              <div className="settings-section" style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="apply-button"
                  style={{ flex: 1, background: 'rgba(0, 255, 0, 0.1)', border: 'none', transition: 'all 0.2s ease' }}
                  onClick={() => {
                    setSelectedPlaneFilters(new Set());
                    localStorage.removeItem('selectedPlaneFilters');
                  }}
                >
                  Clear All
                </button>
                <button 
                  className="apply-button"
                  style={{ flex: 1, background: currentColors.primary, color: '#000', border: 'none', transition: 'all 0.2s ease' }}
                  onClick={() => {
                    if (planesDatabase) {
                      const allPlanes = new Set<string>();
                      planesDatabase.planes.forEach(m => m.models.forEach(p => allPlanes.add(p.plane_name)));
                      allPlanes.add(OTHERS_FILTER);
                      setSelectedPlaneFilters(allPlanes);
                      localStorage.setItem('selectedPlaneFilters', JSON.stringify(Array.from(allPlanes)));
                    }
                  }}
                >
                  Select All
                </button>
              </div>

              {/* Others Category */}
              <div className="settings-section">
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                  borderBottom: `1px solid rgba(0, 255, 0, 0.2)`,
                  paddingBottom: '0.3rem'
                }}>
                  <h3 style={{ 
                    color: currentColors.primary, 
                    fontSize: '1.1rem', 
                    margin: 0
                  }}>
                    Others
                  </h3>
                </div>
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.8rem',
                    background: selectedPlaneFilters.has(OTHERS_FILTER) ? currentColors.primary : 'rgba(0, 255, 0, 0.05)',
                    border: `1px solid ${selectedPlaneFilters.has(OTHERS_FILTER) ? currentColors.primary : 'rgba(0, 255, 0, 0.2)'}`,
                    color: selectedPlaneFilters.has(OTHERS_FILTER) ? '#000' : currentColors.primary,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    width: '100%',
                    fontSize: '0.9rem',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  onClick={() => {
                    const newFilters = new Set(selectedPlaneFilters);
                    if (selectedPlaneFilters.has(OTHERS_FILTER)) {
                      newFilters.delete(OTHERS_FILTER);
                    } else {
                      newFilters.add(OTHERS_FILTER);
                    }
                    setSelectedPlaneFilters(newFilters);
                    localStorage.setItem('selectedPlaneFilters', JSON.stringify(Array.from(newFilters)));
                  }}
                >
                  {selectedPlaneFilters.has(OTHERS_FILTER) && (
                    <div style={{
                      position: 'absolute',
                      right: '10px',
                      background: '#00ff00',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      color: '#000'
                    }}>
                      ✓
                    </div>
                  )}
                  All unrecognized aircraft types
                </button>
              </div>

              {planesDatabase && planesDatabase.planes.map((manufacturer) => {
                const manufacturerPlanes = manufacturer.models.map(m => m.plane_name);
                const allSelected = manufacturerPlanes.every(p => selectedPlaneFilters.has(p));
                const someSelected = manufacturerPlanes.some(p => selectedPlaneFilters.has(p));
                
                return (
                  <div key={manufacturer.manufacturer_name} className="settings-section">
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                      borderBottom: `1px solid ${currentColors.primary}`,
                      paddingBottom: '0.3rem'
                    }}>
                      <h3 style={{ 
                        color: currentColors.primary, 
                        fontSize: '1.1rem', 
                        margin: 0
                      }}>
                        {manufacturer.manufacturer_name}
                      </h3>
                      <button
                        style={{
                          background: allSelected ? currentColors.primary : someSelected ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.1)',
                          border: `1px solid ${currentColors.primary}`,
                          color: allSelected ? '#000' : currentColors.primary,
                          padding: '0.3rem 0.8rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 'bold'
                        }}
                        onClick={() => {
                          const newFilters = new Set(selectedPlaneFilters);
                          if (allSelected) {
                            manufacturerPlanes.forEach(p => newFilters.delete(p));
                          } else {
                            manufacturerPlanes.forEach(p => newFilters.add(p));
                          }
                          setSelectedPlaneFilters(newFilters);
                          localStorage.setItem('selectedPlaneFilters', JSON.stringify(Array.from(newFilters)));
                        }}
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                      {manufacturer.models.map((model) => {
                        const isSelected = selectedPlaneFilters.has(model.plane_name);
                        return (
                          <button
                            key={model.plane_name}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              padding: '0.5rem',
                              background: isSelected ? currentColors.primary : 'rgba(0, 255, 0, 0.05)',
                              border: `2px solid ${isSelected ? currentColors.primary : 'rgba(0, 255, 0, 0.2)'}`,
                              color: isSelected ? '#000' : currentColors.primary,
                              minHeight: '80px',
                              position: 'relative',
                              cursor: 'pointer',
                              borderRadius: '4px'
                            }}
                            onClick={() => {
                              const newFilters = new Set(selectedPlaneFilters);
                              if (isSelected) {
                                newFilters.delete(model.plane_name);
                              } else {
                                newFilters.add(model.plane_name);
                              }
                              setSelectedPlaneFilters(newFilters);
                              localStorage.setItem('selectedPlaneFilters', JSON.stringify(Array.from(newFilters)));
                            }}
                          >
                            {isSelected && (
                              <div style={{
                                position: 'absolute',
                                top: '5px',
                                right: '5px',
                                background: '#00ff00',
                                borderRadius: '50%',
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                color: '#000'
                              }}>
                                ✓
                              </div>
                            )}
                            <img 
                              src={model.photo_url} 
                              alt={model.plane_name}
                              style={{ 
                                width: '100%', 
                                height: '60px', 
                                objectFit: 'cover', 
                                marginBottom: '0.3rem',
                                borderRadius: '4px',
                                opacity: isSelected ? 1 : 0.6
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <span style={{ fontSize: '0.8rem', textAlign: 'center' }}>{model.plane_name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
          {devMode ? (
            <>
              {selectedAircraft.t && !selectedAircraft.t.includes('tisb') && !selectedAircraft.t.includes('adsb') && !selectedAircraft.t.includes('adsr') && (
                <p><strong>Type Code:</strong> {selectedAircraft.t}</p>
              )}
              {selectedAircraft.desc && (
                <p><strong>Description:</strong> {selectedAircraft.desc}</p>
              )}
            </>
          ) : (
            (selectedAircraft.desc || (selectedAircraft.t && !selectedAircraft.t.includes('tisb') && !selectedAircraft.t.includes('adsb') && !selectedAircraft.t.includes('adsr'))) && (
              <p><strong>Model:</strong> {selectedAircraft.desc || selectedAircraft.t}</p>
            )
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
        zIndex: 10000,
        maxWidth: '300px'
      }}>
        <div>⏱ {countdown}s | Tracking: {aircraft.length}</div>
        {selectedPlaneFilters.size > 0 && (
          <div style={{ 
            fontSize: '0.75rem', 
            marginTop: '5px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            opacity: 0.8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            <Filter size={14} /> {selectedPlaneFilters.size} filter{selectedPlaneFilters.size > 1 ? 's' : ''}
          </div>
        )}
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
