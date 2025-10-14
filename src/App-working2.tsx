import { useState, useEffect, useRef } from 'react';
import './App.css';

// --- SVG Icons ---
const RegistrationIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>;
const TypeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.3 11.7 12.4 2.8a2.2 2.2 0 0 0-3.1 0L2.7 11.7a2.2 2.2 0 0 0 0 3.1l8.9 8.9a2.2 2.2 0 0 0 3.1 0l8.9-8.9a2.2 2.2 0 0 0 0-3.1Z"/><path d="m12 8-3 3 3 3 3-3-3-3Z"/></svg>;
const ManufacturerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7h-4a3 3 0 0 0-3 3v4Z"/><path d="M21 15a7 7 0 0 0-7-7h-4a3 3 0 0 0-3 3v4Z"/><path d="M12 8a7 7 0 0 0-7 7h4a3 3 0 0 0 3-3V8Z"/><path d="M3 8a7 7 0 0 0 7 7h4a3 3 0 0 0 3-3V8Z"/></svg>;
const OwnerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

// --- Interfaces ---
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
  ICAOTypeCode: string;
  ModeS: string;
  OperatorFlagCode: string;
  error?: string;
}

interface RouteInfo {
  flight: string;
  route: string;
}

interface AirportInfo {
  airport: string;
  country_code: string;
  iata: string;
  icao: string;
  latitude: number;
  longitude: number;
  region_name: string;
}

function App() {
  const [isRevealing, setIsRevealing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraftDetail, setSelectedAircraftDetail] = useState<AircraftDetail | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [airportA, setAirportA] = useState<AirportInfo | null>(null);
  const [airportB, setAirportB] = useState<AirportInfo | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const previousAircraft = useRef(new Set());
  const REFRESH_INTERVAL = 60;

  const fetchAircraftDetails = async (hex: string) => {
    try {
      const detailsUrl = `/details-api/aircraft/${hex}`;
      const detailsRes = await fetch(detailsUrl);
      if (!detailsRes.ok) throw new Error(`HTTP error! status: ${detailsRes.status}`);
      const detailsData = await detailsRes.json();
      if (detailsData.status === '404') throw new Error('404');

      const details: AircraftDetail = detailsData;
      const registration = details.Registration;
      const image = `https://hexdb.io/hex-image?hex=${hex}`;
      setImageUrl(image);

      // Fetch route data using registration
      const routeUrl = `/details-api/route/icao/${registration}`;
      const routeRes = await fetch(routeUrl);
      if (routeRes.ok) {
        const routeData = await routeRes.json();
        if (!routeData.status || routeData.status !== '404') {
          setRouteInfo(routeData);
          // Extract airports and fetch their details
          if (routeData.route && routeData.route.includes('-')) {
            const [fromIcao, toIcao] = routeData.route.split('-');
            fetchAirportDetails(fromIcao, toIcao);
          }
        } else {
          setRouteInfo(null);
          setAirportA(null);
          setAirportB(null);
        }
      } else {
        setRouteInfo(null);
      }

      // Reveal details
      setSelectedAircraftDetail(null);
      setIsRevealing(true);
      setTimeout(() => {
        setSelectedAircraftDetail(details);
        setIsRevealing(false);
      }, 2800);
    } catch (error) {
      console.error(`Error fetching details for ${hex}:`, error);
      if (error instanceof Error && error.message.includes('404')) {
        setSelectedAircraftDetail({
          Registration: hex,
          error: 'Details not found in database.',
        } as any);
      } else {
        setSelectedAircraftDetail(null);
      }
      setRouteInfo(null);
      setAirportA(null);
      setAirportB(null);
      setImageUrl(null);
    }
  };

  const fetchAirportDetails = async (from: string, to: string) => {
    try {
      const [fromRes, toRes] = await Promise.all([
        fetch(`/details-api/airport/icao/${from}`),
        fetch(`/details-api/airport/icao/${to}`),
      ]);

      const fromData = fromRes.ok ? await fromRes.json() : null;
      const toData = toRes.ok ? await toRes.json() : null;

      setAirportA(fromData?.status === '404' ? null : fromData);
      setAirportB(toData?.status === '404' ? null : toData);
    } catch (error) {
      console.error("Error fetching airport data:", error);
      setAirportA(null);
      setAirportB(null);
    }
  };

  const fetchData = async () => {
    setCountdown(REFRESH_INTERVAL);
    try {
      const url = "/api/lat/33.9416/lon/-118.4085/dist/20";
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const currentAircraft: Aircraft[] = data.aircraft || [];
      const currentHexCodes = new Set(currentAircraft.map(ac => ac.hex));

      const newEntries = currentAircraft.filter(ac => !previousAircraft.current.has(ac.hex) && ac.r);
      if (newEntries.length > 0) {
        const featuredAircraft = newEntries[0];
        const cleanHex = featuredAircraft.hex.replace('~', '');
        fetchAircraftDetails(cleanHex);
      }

      setAircraft(currentAircraft);
      previousAircraft.current = currentHexCodes;
    } catch (error) {
      console.error("Error fetching aircraft data:", error);
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, REFRESH_INTERVAL * 1000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`App ${isRevealing ? 'content-fade-out' : ''}`}>
      {isRevealing && (
        <div className="reveal-overlay">
          <div className="reveal-grid"></div>
          <h1 className="glitch-text">NEW AIRCRAFT DETECTED</h1>
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
            <div className="detail-item">
              <h2>Details Not Found</h2>
              <p>Could not find details for aircraft <strong>{selectedAircraftDetail.Registration}</strong>.</p>
            </div>
          ) : (
            <>
              <h2>New Aircraft Spotted!</h2>
              {imageUrl && (
                <div className="detail-item">
                  <img src={imageUrl} alt="Aircraft" style={{ maxWidth: '100%', borderRadius: '12px' }} />
                </div>
              )}
              <div className="detail-item">
                <RegistrationIcon />
                <p><strong>Registration:</strong> {selectedAircraftDetail.Registration}</p>
              </div>
              <div className="detail-item">
                <TypeIcon />
                <p><strong>Type:</strong> {selectedAircraftDetail.Type}</p>
              </div>
              <div className="detail-item">
                <ManufacturerIcon />
                <p><strong>Manufacturer:</strong> {selectedAircraftDetail.Manufacturer}</p>
              </div>
              <div className="detail-item">
                <OwnerIcon />
                <p><strong>Owner:</strong> {selectedAircraftDetail.RegisteredOwners}</p>
              </div>

              {routeInfo && (
                <>
                  <div className="detail-item">
                    <p><strong>Flight:</strong> {routeInfo.flight}</p>
                  </div>
                  <div className="detail-item">
                    <p><strong>Route:</strong> {routeInfo.route}</p>
                  </div>
                </>
              )}

              {airportA && airportB && (
                <div className="detail-item">
                  <p><strong>From:</strong> {airportA.airport} ({airportA.icao}) → <strong>To:</strong> {airportB.airport} ({airportB.icao})</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
