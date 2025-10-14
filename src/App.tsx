import { useState, useEffect, useRef } from 'react';
import './App.css';

// --- SVG Icons ---
const RegistrationIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>;
const TypeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.3 11.7 12.4 2.8a2.2 2.2 0 0 0-3.1 0L2.7 11.7a2.2 2.2 0 0 0 0 3.1l8.9 8.9a2.2 2.2 0 0 0 3.1 0l8.9-8.9a2.2 2.2 0 0 0 0-3.1Z"/><path d="m12 8-3 3 3 3 3-3-3-3Z"/></svg>;
const ManufacturerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7h-4a3 3 0 0 0-3 3v4Z"/><path d="M21 15a7 7 0 0 0-7-7h-4a3 3 0 0 0-3 3v4Z"/><path d="M12 8a7 7 0 0 0-7 7h4a3 3 0 0 0 3-3V8Z"/><path d="M3 8a7 7 0 0 0 7 7h4a3 3 0 0 0 3-3V8Z"/></svg>;
const OwnerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

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
              <div className="detail-item"><RegistrationIcon /><p><strong>Registration:</strong> {selectedAircraftDetail.Registration}</p></div>
              <div className="detail-item"><TypeIcon /><p><strong>Type:</strong> {selectedAircraftDetail.Type}</p></div>
              <div className="detail-item"><ManufacturerIcon /><p><strong>Manufacturer:</strong> {selectedAircraftDetail.Manufacturer}</p></div>
              <div className="detail-item"><OwnerIcon /><p><strong>Owner:</strong> {selectedAircraftDetail.RegisteredOwners}</p></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
