import { useState, useEffect, useRef } from 'react';
import './App.css';

// --- Data Structures ---
interface Aircraft {
  hex: string; // ICAO hex code
  r: string; // Registration
  t: string; // Type
  lat: number;
  lon: number;
  alt_baro: number;
  gs: number;
}

interface AircraftDetail {
  registration: string;
  manufacturer: string;
  type: string;
  url_photo: string;
  url_photo_thumbnail: string;
  registered_owner: string;
  registered_owner_country_name: string;
  error?: string;
}

const REFRESH_INTERVAL = 5; // seconds

function App() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraftDetail, setSelectedAircraftDetail] = useState<AircraftDetail | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const previousAircraft = useRef<Set<string>>(new Set());

  // --- API Calls ---
  const fetchAircraftDetails = async (hex: string) => {
    try {
      console.log(`Fetching details for new aircraft: ${hex}`);
      const response = await fetch(`/details-api/aircraft/${hex}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const jsonResponse = await response.json();
      const details: AircraftDetail = jsonResponse.response.aircraft;
      console.log("Received details:", details);

      setIsRevealing(true);
      setSelectedAircraftDetail(details);
      setTimeout(() => setIsRevealing(false), 2800); // Duration of the new reveal animation

    } catch (error) {
      console.error(`Error fetching details for ${hex}:`, error);
      if (error instanceof Error && error.message.includes('404')) {
        setSelectedAircraftDetail({ registration: hex, error: 'Details not found in database.' } as any);
      } else {
        setSelectedAircraftDetail(null);
      }
    }
  };

  const fetchData = async () => {
    console.log("----------------------------------------");
    console.log("Attempting to fetch data...");
    setCountdown(REFRESH_INTERVAL);
    try {
      const response = await fetch("/api/lat/33.6324/lon/-84.4333/dist/10");
      console.log(`Received response: ${response.status} ${response.statusText}`);

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      console.log("Successfully parsed JSON data:", data);

      const currentAircraft: Aircraft[] = data.aircraft || [];
      const currentHexCodes = new Set(currentAircraft.map(ac => ac.hex));

      console.log("PREVIOUS aircraft hex codes:", previousAircraft.current);
      console.log("CURRENT aircraft hex codes:", currentHexCodes);

      const newEntries = currentAircraft.filter(ac => !previousAircraft.current.has(ac.hex));

      if (newEntries.length > 0) {
        console.log("✅ New aircraft detected:", newEntries);
        const featuredAircraft = newEntries[0];
        // Sanitize the hex code to remove non-standard prefixes like '~'
        const cleanHex = featuredAircraft.hex.replace('~', '');
        fetchAircraftDetails(cleanHex);
      } else {
        console.log("👀 No new aircraft detected on this fetch.");
      }

      setAircraft(currentAircraft);
      previousAircraft.current = currentHexCodes;
      console.log("💾 Saved current hex codes for next fetch:", previousAircraft.current);

    } catch (error) {
      console.error("Error fetching aircraft data:", error);
    }
  };

  // Main fetch interval
  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, REFRESH_INTERVAL * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Countdown timer interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Render ---
  return (
    <div className={`App ${isRevealing ? 'content-fade-out' : ''}`}>
      {isRevealing && (
        <div className="reveal-overlay">
          <div className="reveal-grid"></div>
          <h1 className="glitch-text">NEW AIRCRAFT DETECTED</h1>
          <div className="scanner"></div>
        </div>
      )}
      <header className="App-header">
        <h1>Snailwatch</h1>
        <p>Tracking {aircraft.length} aircraft.</p>
        <p className="countdown">Next refresh in {countdown}s...</p>
      </header>

      {selectedAircraftDetail && (
        <div className={`details-card ${isRevealing ? 'reveal-animation' : 'fade-in'}`}>
          {selectedAircraftDetail.error ? (
            <div>
              <h2>Details Not Found</h2>
              <p>Could not find details for aircraft <strong>{selectedAircraftDetail.registration}</strong> in the database.</p>
            </div>
          ) : (
            <div>
              <h2>New Aircraft Spotted!</h2>
              {selectedAircraftDetail.url_photo_thumbnail && (
                <img src={selectedAircraftDetail.url_photo_thumbnail} alt={`Photo of ${selectedAircraftDetail.registration}`} className="aircraft-photo" />
              )}
              <p><strong>Registration:</strong> {selectedAircraftDetail.registration}</p>
              <p><strong>Type:</strong> {selectedAircraftDetail.type}</p>
              <p><strong>Manufacturer:</strong> {selectedAircraftDetail.manufacturer}</p>
              <p><strong>Owner:</strong> {selectedAircraftDetail.registered_owner}</p>
              <p><strong>Country:</strong> {selectedAircraftDetail.registered_owner_country_name}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
