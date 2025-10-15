import { useState, useEffect, useRef } from 'react';
import './App.css';
import { FileText, Plane, Factory, Users, Radio } from 'lucide-react';

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

  const previousAircraft = useRef(new Set<string>());
  const REFRESH_INTERVAL = 5;

  const fetchAircraftDetails = async (hex: string) => {
    try {
      console.log('Fetching details:', hex);
      const res = await fetch(`/details-api/aircraft/${hex}`);
      console.log('Details response:', res.status);
      if (!res.ok) {
        if (res.status === 404) {
          setSelectedAircraftDetail({ Registration: hex, error: 'Not found' } as any);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const details: AircraftDetail = await res.json();
      setSelectedAircraftDetail(null);
      setIsRevealing(true);
      setTimeout(() => {
        setSelectedAircraftDetail(details);
        setIsRevealing(false);
      }, 2000);
    } catch (err) {
      console.error('Error fetching details:', err);
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
      const url = `/api/lat/${userLocation.lat}/lon/${userLocation.lon}/dist/20`;
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

      <header className="App-header">
        <h1>Snailwatch</h1>
        {userLocation && (
          <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>
            📍 {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}
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
