import { useState, useEffect, useRef } from 'react';
import './App.css';
import { FileText, Plane, Factory, Users, Radio, Settings, X } from 'lucide-react';

// --- Data Interfaces ---
interface Aircraft {
  hex: string;
  r: string;
  t: string;
  lat: number;
  lon: number;
  alt_baro: number;
  gs: number;
}

interface AircraftDetail {
  Registration: string;
  Manufacturer: string;
  Type: string;
  RegisteredOwners: string;
  error?: string;
}

function App() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraftDetail, setSelectedAircraftDetail] = useState<AircraftDetail | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [icaoRepo, setIcaoRepo] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [customLat, setCustomLat] = useState('');
  const [customLon, setCustomLon] = useState('');
  const [radius, setRadius] = useState('20');
  const [useCustomLocation, setUseCustomLocation] = useState(false);

  const previousAircraft = useRef(new Set<string>());
  const REFRESH_INTERVAL = 5;

  const fetchAircraftDetails = async (hex: string) => {
    try {
      console.log('Fetching details for hex:', hex);
      
      // Try primary API first
      try {
        const res = await fetch(`/details-api/aircraft/${hex}`);
        if (res.ok) {
          const details: AircraftDetail = await res.json();
          setSelectedAircraftDetail(null);
          setIsRevealing(true);
          setTimeout(() => {
            setSelectedAircraftDetail(details);
            setIsRevealing(false);
          }, 2000);
          console.log('✓ Primary API succeeded');
          return;
        }
        console.log('Primary API failed, trying fallbacks...');
      } catch (err) {
        console.log('Primary API error:', err);
      }

      // Try adsbdb.com
      try {
        console.log('Trying adsbdb.com...');
        const adsbRes = await fetch(`https://api.adsbdb.com/v0/aircraft/${hex}`);
        if (adsbRes.ok) {
          const adsbData = await adsbRes.json();
          const aircraft = adsbData.response?.aircraft;
          if (aircraft) {
            const details: AircraftDetail = {
              Registration: aircraft.registration || hex,
              Manufacturer: aircraft.manufacturer || 'Unknown',
              Type: aircraft.type || aircraft.icao_type || 'Unknown',
              RegisteredOwners: aircraft.registered_owner || 'Unknown',
            };
            setSelectedAircraftDetail(null);
            setIsRevealing(true);
            setTimeout(() => {
              setSelectedAircraftDetail(details);
              setIsRevealing(false);
            }, 2000);
            console.log('✓ adsbdb.com succeeded');
            return;
          }
        }
        console.log('adsbdb.com failed, trying hexdb.io...');
      } catch (err) {
        console.log('adsbdb.com error:', err);
      }

      // Try hexdb.io
      try {
        console.log('Trying hexdb.io...');
        const hexdbRes = await fetch(`https://hexdb.io/api/v1/aircraft/${hex}`);
        if (hexdbRes.ok) {
          const hexdbData = await hexdbRes.json();
          if (!hexdbData.error) {
            const details: AircraftDetail = {
              Registration: hexdbData.Registration || hex,
              Manufacturer: hexdbData.Manufacturer || 'Unknown',
              Type: hexdbData.Type || hexdbData.ICAOTypeCode || 'Unknown',
              RegisteredOwners: hexdbData.RegisteredOwners || 'Unknown',
            };
            setSelectedAircraftDetail(null);
            setIsRevealing(true);
            setTimeout(() => {
              setSelectedAircraftDetail(details);
              setIsRevealing(false);
            }, 2000);
            console.log('✓ hexdb.io succeeded');
            return;
          }
        }
        console.log('hexdb.io failed, trying local JSON...');
      } catch (err) {
        console.log('hexdb.io error:', err);
      }

      // Try local ICAO repo JSON
      if (icaoRepo) {
        console.log('Trying local ICAO repo...');
        const hexUpper = hex.toUpperCase();
        console.log('Looking up hex:', hexUpper, 'in repo with', Object.keys(icaoRepo).length, 'entries');
        const localData = icaoRepo[hexUpper];
        console.log('Local data found:', localData);
        if (localData) {
          // Build details from whatever fields are available
          const registration = localData.r || localData.reg || localData.registration || hex;
          const manufacturer = localData.m || localData.manufacturer || (localData.model ? `Unknown (${localData.model})` : null);
          const type = localData.t || localData.type || localData.icaotype || localData.short_type || null;
          const owner = localData.o || localData.owner || localData.ownop || null;
          
          console.log('Parsed data:', { registration, manufacturer, type, owner });
          
          // Only use this entry if we have at least registration or some identifying info
          if (registration || type) {
            const details: AircraftDetail = {
              Registration: registration,
              Manufacturer: manufacturer || 'Unknown',
              Type: type || 'Unknown',
              RegisteredOwners: owner || 'Unknown',
            };
            setSelectedAircraftDetail(null);
            setIsRevealing(true);
            setTimeout(() => {
              setSelectedAircraftDetail(details);
              setIsRevealing(false);
            }, 2000);
            console.log('✓ Local ICAO repo succeeded (partial data)');
            return;
          }
        } else {
          console.log('No entry found for hex:', hexUpper);
        }
      } else {
        console.log('ICAO repo not loaded yet');
      }

      // All sources failed
      console.log('✗ All sources failed');
      setSelectedAircraftDetail({ Registration: hex, error: 'Not found in any database' } as any);
    } catch (err) {
      console.error('Error in fetchAircraftDetails:', err);
      setSelectedAircraftDetail({ Registration: hex, error: 'Error fetching details' } as any);
    }
  };

  const fetchData = async () => {
    if (!userLocation) {
      console.log('Waiting for location...');
      return;
    }
    
    console.log('Fetching aircraft list...');
    setCountdown(REFRESH_INTERVAL);
    try {
      const url = `/api/lat/${userLocation.lat}/lon/${userLocation.lon}/dist/${radius}`;
      console.log('Request:', url);
      const res = await fetch(url);
      console.log('Response:', res.status);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('Aircraft JSON:', data);

      const currentAircraft: Aircraft[] = data.aircraft || [];
      const currentHexCodes = new Set(currentAircraft.map(ac => ac.hex));

      const newEntries = currentAircraft.filter(ac => !previousAircraft.current.has(ac.hex) && ac.r);
      if (newEntries.length > 0) {
        console.log('New aircraft detected:', newEntries);
        fetchAircraftDetails(newEntries[0].hex.replace('~', ''));
      }

      setAircraft(currentAircraft);
      previousAircraft.current = currentHexCodes;
    } catch (err) {
      console.error('Error fetching aircraft:', err);
    }
  };

  useEffect(() => {
    // Load ICAO repo JSON on startup
    console.log('Loading ICAO repository...');
    fetch('/icaorepo.json')
      .then(res => res.text())
      .then(text => {
        const icaoMap: any = {};
        
        // Try parsing as regular JSON first
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            data.forEach((entry: any) => {
              if (entry.icao) {
                icaoMap[entry.icao.toUpperCase()] = entry;
              }
            });
          } else if (typeof data === 'object') {
            // Already an object
            Object.assign(icaoMap, data);
          }
        } catch (e) {
          // If regular JSON fails, try NDJSON (newline-delimited JSON)
          console.log('Parsing as NDJSON...');
          const lines = text.split('\n');
          lines.forEach((line, index) => {
            if (line.trim()) {
              try {
                const entry = JSON.parse(line);
                if (entry.icao) {
                  icaoMap[entry.icao.toUpperCase()] = entry;
                }
              } catch (err) {
                // Skip invalid lines
                if (index < 5) {
                  console.warn('Failed to parse line', index, ':', err);
                }
              }
            }
          });
        }
        
        setIcaoRepo(icaoMap);
        console.log(`✓ ICAO repository loaded (${Object.keys(icaoMap).length} entries)`);
      })
      .catch(err => {
        console.error('Failed to load ICAO repo:', err);
      });

    // Get user's location
    if ('geolocation' in navigator) {
      console.log('Requesting geolocation...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          console.log('Location obtained:', latitude, longitude);
          setUserLocation({ lat: latitude, lon: longitude });
          setLocationError(null);
        },
        (error) => {
          console.error('Geolocation error:', error);
          setLocationError(error.message);
          // Fallback to default location (LAX area)
          setUserLocation({ lat: 33.9416, lon: -118.4085 });
        }
      );
    } else {
      console.error('Geolocation not supported');
      setLocationError('Geolocation not supported by browser');
      // Fallback to default location
      setUserLocation({ lat: 33.9416, lon: -118.4085 });
    }
  }, []);

  useEffect(() => {
    if (!userLocation) return;
    
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [userLocation]);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="App">
      <div className="radar-bg"></div>

      {isRevealing && (
        <div className="reveal-overlay reveal-overlay-enter">
          <div className="reveal-content">
            <Radio size={80} color="#00ff00" strokeWidth={2} style={{ marginBottom: '1rem', filter: 'drop-shadow(0 0 20px rgba(0, 255, 0, 0.8))' }} />
            <h1 className="glitch-text">NEW AIRCRAFT DETECTED</h1>
          </div>
        </div>
      )}

      <button 
        className="settings-button"
        onClick={() => setShowSettings(true)}
        aria-label="Settings"
      >
        <Settings size={24} color="#00ff00" />
      </button>

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-popup" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>SETTINGS</h2>
              <button className="close-button" onClick={() => setShowSettings(false)}>
                <X size={24} color="#00ff00" />
              </button>
            </div>
            
            <div className="settings-content">
              <div className="settings-section">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={useCustomLocation}
                    onChange={(e) => setUseCustomLocation(e.target.checked)}
                  />
                  <span>Use Custom Location</span>
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
                      placeholder="e.g., 33.9416"
                      className="settings-input"
                    />
                  </div>

                  <div className="settings-section">
                    <label>Longitude</label>
                    <input 
                      type="text" 
                      value={customLon}
                      onChange={(e) => setCustomLon(e.target.value)}
                      placeholder="e.g., -118.4085"
                      className="settings-input"
                    />
                  </div>
                </>
              )}

              <div className="settings-section">
                <label>Radius (km)</label>
                <input 
                  type="text" 
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  placeholder="e.g., 20"
                  className="settings-input"
                />
              </div>

              <button 
                className="apply-button"
                onClick={() => {
                  if (useCustomLocation && customLat && customLon) {
                    const lat = parseFloat(customLat);
                    const lon = parseFloat(customLon);
                    if (!isNaN(lat) && !isNaN(lon)) {
                      setUserLocation({ lat, lon });
                      setLocationError(null);
                    } else {
                      setLocationError('Invalid coordinates');
                    }
                  }
                  setShowSettings(false);
                }}
              >
                APPLY
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="App-header">
        <h1>Snailwatch</h1>
        {userLocation && (
          <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>
            📍 {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)} • {radius}km radius
          </p>
        )}
        {locationError && (
          <p style={{ fontSize: '0.9rem', color: '#ffaa00' }}>⚠️ {locationError}</p>
        )}
        <p>Tracking {aircraft.length} aircraft.</p>
        <p className="countdown">Next refresh in {countdown}s</p>
      </header>

      {selectedAircraftDetail && (
        <div className="details-card details-card-enter">
          {selectedAircraftDetail.error ? (
            <div className="detail-item detail-item-1">
              <p>Aircraft <strong>{selectedAircraftDetail.Registration}</strong> not found.</p>
            </div>
          ) : (
            <>
              <div className="card-header card-header-enter">
                <Plane size={32} color="#00ff00" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 0 8px rgba(0, 255, 0, 0.6))' }} />
                <h2>AIRCRAFT IDENTIFIED</h2>
              </div>
              <div className="detail-item detail-item-1">
                <FileText size={24} color="#00ff00" strokeWidth={2} />
                <p><strong>Registration:</strong> {selectedAircraftDetail.Registration}</p>
              </div>
              <div className="detail-item detail-item-2">
                <Plane size={24} color="#00ff00" strokeWidth={2} />
                <p><strong>Type:</strong> {selectedAircraftDetail.Type}</p>
              </div>
              <div className="detail-item detail-item-3">
                <Factory size={24} color="#00ff00" strokeWidth={2} />
                <p><strong>Manufacturer:</strong> {selectedAircraftDetail.Manufacturer}</p>
              </div>
              <div className="detail-item detail-item-4">
                <Users size={24} color="#00ff00" strokeWidth={2} />
                <p><strong>Owner:</strong> {selectedAircraftDetail.RegisteredOwners}</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
