import { useState, useEffect, useRef } from 'react';
import './App.css';
import { FileText, Plane, Factory, Users } from 'lucide-react';

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
    console.log('Fetching aircraft list...');
    setCountdown(REFRESH_INTERVAL);
    try {
      const url = '/api/lat/33.9416/lon/-118.4085/dist/20';
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
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="App">
      <div className="radar-bg"></div>

      {isRevealing && (
        <div className="reveal-overlay">
          <h1 className="glitch-text">NEW AIRCRAFT DETECTED</h1>
        </div>
      )}

      <header className="App-header">
        <h1>Snailwatch</h1>
        <p>Tracking {aircraft.length} aircraft.</p>
        <p className="countdown">Next refresh in {countdown}s</p>
      </header>

      {selectedAircraftDetail && (
        <div className="details-card">
          {selectedAircraftDetail.error ? (
            <div className="detail-item">
              <p>Aircraft <strong>{selectedAircraftDetail.Registration}</strong> not found.</p>
            </div>
          ) : (
            <>
              <div className="detail-item"><FileText size={24} color="#00ff00" /><p><strong>Registration:</strong> {selectedAircraftDetail.Registration}</p></div>
              <div className="detail-item"><Plane size={24} color="#00ff00" /><p><strong>Type:</strong> {selectedAircraftDetail.Type}</p></div>
              <div className="detail-item"><Factory size={24} color="#00ff00" /><p><strong>Manufacturer:</strong> {selectedAircraftDetail.Manufacturer}</p></div>
              <div className="detail-item"><Users size={24} color="#00ff00" /><p><strong>Owner:</strong> {selectedAircraftDetail.RegisteredOwners}</p></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
