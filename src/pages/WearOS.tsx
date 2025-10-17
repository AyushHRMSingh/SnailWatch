import { useState, useEffect, useRef } from 'react';
import '../styles/WearOS.css';
import { Radio, Plane, Users, Navigation, Mountain, Gauge, Volume2, VolumeX, ExternalLink } from 'lucide-react';
import { useColors } from '../context/ColorContext';

// ===== CONFIGURABLE TIMERS =====
const FETCH_INTERVAL_MS = 2500;  // How often to fetch aircraft data (milliseconds)
const REFRESH_INTERVAL = 10;     // Check for new aircraft every N fetches (10 = every 25 seconds)
// ===============================

// --- Data Interfaces ---
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

function WearOS() {
  const { currentColors } = useColors();
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraftDetail, setSelectedAircraftDetail] = useState<AircraftDetail | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [radius] = useState(() => localStorage.getItem('radius') || '20');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false');
  const [dataSource] = useState<'adsb.fi' | 'airplanes.live'>(() => (localStorage.getItem('dataSource') as 'adsb.fi' | 'airplanes.live') || 'adsb.fi');

  const previousAircraft = useRef(new Set<string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fetchCounter = useRef(0);

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
        Manufacturer: 'Not found',
        Type: aircraftData.desc || aircraftData.t || 'Unknown',
        RegisteredOwners: 'Not found',
        Callsign: callsign,
        Altitude: altitude,
        Speed: speedKmh,
      };

      setIsRevealing(true);
      setSelectedAircraftDetail(defaultDetails);
      setTimeout(() => {
        setIsRevealing(false);
      }, 1500);
    }

    try {
      // Try adsbdb.com as PRIMARY API
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
            return;
          }
        }
      } catch (err) {
        console.log('adsbdb.com error:', err);
      }

      // Try custom details API as fallback
      try {
        const res = await fetch(`/details-api/aircraft/${hex}`);
        if (res.ok) {
          const details: AircraftDetail = await res.json();
          details.ICAO = hex;
          details.Callsign = callsign;
          details.Altitude = altitude;
          details.Speed = speedKmh;
          setSelectedAircraftDetail(details);
          return;
        }
      } catch (err) {
        console.log('Custom API error:', err);
      }

      // Try hexdb.io
      try {
        const hexdbRes = await fetch(`https://hexdb.io/api/v1/aircraft/${hex}`);
        if (hexdbRes.ok) {
          const hexdbData = await hexdbRes.json();
          if (!hexdbData.error) {
            const details: AircraftDetail = {
              ICAO: hex,
              Registration: hexdbData.Registration || hex,
              Manufacturer: hexdbData.Manufacturer || 'Unknown',
              Type: hexdbData.Type || hexdbData.ICAOTypeCode || 'Unknown',
              RegisteredOwners: hexdbData.RegisteredOwners || 'Unknown',
              Callsign: callsign,
              Altitude: altitude,
              Speed: speedKmh,
            };
            setSelectedAircraftDetail(details);
            return;
          }
        }
      } catch (err) {
        console.log('hexdb.io error:', err);
      }
    } catch (err) {
      console.error('Error in fetchAircraftDetails:', err);
    }
  };

  const fetchData = async () => {
    if (!userLocation) {
      return;
    }

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
          }, 300);
        }

        previousAircraft.current = currentHexCodes;
      }
    } catch (err) {
      console.error('Error fetching aircraft:', err);
    }
  };

  // Geolocation effect with retry logic
  useEffect(() => {
    const savedUseCustom = localStorage.getItem('useCustomLocation') === 'true';
    const savedLat = localStorage.getItem('customLat');
    const savedLon = localStorage.getItem('customLon');

    if (savedUseCustom && savedLat && savedLon) {
      const lat = parseFloat(savedLat);
      const lon = parseFloat(savedLon);
      if (!isNaN(lat) && !isNaN(lon)) {
        setUserLocation({ lat, lon });
        setLocationError(null);
        return;
      }
    }

    const requestLocation = (retryCount = 0) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setUserLocation({ lat: latitude, lon: longitude });
            setLocationError(null);
          },
          (error) => {
            console.error('Geolocation error:', error);
            
            // Retry up to 2 times with increasing timeout
            if (retryCount < 2) {
              console.log(`Retrying geolocation (attempt ${retryCount + 2}/3)...`);
              setTimeout(() => requestLocation(retryCount + 1), 2000);
            } else {
              // After retries, use default location
              setLocationError('Location denied');
              setUserLocation({ lat: 33.9416, lon: -118.4085 });
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000 + (retryCount * 5000), // Increase timeout with each retry
            maximumAge: 0
          }
        );
      } else {
        setLocationError('No GPS');
        setUserLocation({ lat: 33.9416, lon: -118.4085 });
      }
    };

    requestLocation();
  }, []);

  // Fetch data effect
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

  // Update altitude and speed for selected aircraft
  useEffect(() => {
    if (!selectedAircraftDetail) return;

    const selectedPlane = aircraft.find(plane =>
      selectedAircraftDetail.ICAO && plane.hex.replace('~', '') === selectedAircraftDetail.ICAO
    );

    if (selectedPlane) {
      setSelectedAircraftDetail(prev => {
        if (!prev) return prev;
        if (prev.Altitude === selectedPlane.alt_baro &&
          prev.Speed === (selectedPlane.gs ? Math.round(selectedPlane.gs * 1.852) : prev.Speed)) {
          return prev;
        }
        return {
          ...prev,
          Altitude: selectedPlane.alt_baro,
          Speed: selectedPlane.gs ? Math.round(selectedPlane.gs * 1.852) : prev.Speed
        };
      });
    }
  }, [aircraft]);

  return (
    <div className="wearos-app">
      {/* Hidden audio element for sonar sound */}
      <audio ref={audioRef} src="/sonar.mp3" preload="auto" />

      {/* Full screen reveal overlay */}
      {isRevealing && (
        <div className="wearos-reveal-overlay">
          <div className="wearos-reveal-content">
            <Radio size={60} color={currentColors.primary} strokeWidth={2} style={{ filter: `drop-shadow(0 0 20px ${currentColors.shadow})` }} />
            <h1 className="wearos-glitch-text">NEW AIRCRAFT</h1>
          </div>
        </div>
      )}

      {/* Sound toggle button */}
      <button
        className="wearos-sound-button"
        onClick={() => {
          const newSoundState = !soundEnabled;
          setSoundEnabled(newSoundState);
          localStorage.setItem('soundEnabled', newSoundState.toString());
        }}
        aria-label="Toggle Sound"
      >
        {soundEnabled ? <Volume2 size="5vmin" color={currentColors.primary} /> : <VolumeX size="5vmin" color="#ff0000" />}
      </button>

      {/* Main circular display */}
      <div className="wearos-circular-container">
        {!selectedAircraftDetail ? (
          // Scanning state
          <div className="wearos-scanning">
            <Radio size={48} color={currentColors.primary} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 8px ${currentColors.shadow})` }} />
            <h2 className="wearos-title">SCANNING</h2>
            <div className="wearos-stats">
              <div className="wearos-stat">⏱ {countdown}s</div>
              <div className="wearos-stat">✈ {aircraft.length}</div>
            </div>
            {locationError && (
              <div className="wearos-error">⚠️ {locationError}</div>
            )}
          </div>
        ) : (
          // Aircraft detected state
          <div className="wearos-aircraft-card">
            <div className="wearos-card-header">
              <Plane size={32} color={currentColors.primary} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 8px ${currentColors.shadow})` }} />
              <h2 className="wearos-card-title">DETECTED</h2>
            </div>

            <div className="wearos-card-content">
              {/* Route */}
              {selectedAircraftDetail.Origin && selectedAircraftDetail.Destination && (
                <div className="wearos-detail">
                  <Navigation size={18} color={currentColors.primary} strokeWidth={2} />
                  <div className="wearos-detail-text">
                    <span className="wearos-detail-label">Route</span>
                    <span className="wearos-detail-value">
                      {selectedAircraftDetail.Origin.iata_code} → {selectedAircraftDetail.Destination.iata_code}
                    </span>
                  </div>
                </div>
              )}

              {/* Airline/Owner */}
              {(selectedAircraftDetail.Airline || selectedAircraftDetail.RegisteredOwners) && (
                <div className="wearos-detail">
                  <Users size={18} color={currentColors.primary} strokeWidth={2} />
                  <div className="wearos-detail-text">
                    <span className="wearos-detail-label">
                      {selectedAircraftDetail.Airline ? 'Airline' : 'Owner'}
                    </span>
                    <span className="wearos-detail-value">
                      {selectedAircraftDetail.Airline
                        ? selectedAircraftDetail.Airline.name
                        : selectedAircraftDetail.RegisteredOwners
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* Registration */}
              <div className="wearos-detail">
                <Plane size={18} color={currentColors.primary} strokeWidth={2} />
                <div className="wearos-detail-text">
                  <span className="wearos-detail-label">Registration</span>
                  <span className="wearos-detail-value">
                    {selectedAircraftDetail.Registration}
                    <a
                      href={`https://www.flightradar24.com/${selectedAircraftDetail.Registration.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginLeft: '6px', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}
                      title="View on FlightRadar24"
                    >
                      <ExternalLink size={14} color={currentColors.primary} strokeWidth={2} />
                    </a>
                  </span>
                </div>
              </div>

              {/* Type */}
              <div className="wearos-detail">
                <Plane size={18} color={currentColors.primary} strokeWidth={2} />
                <div className="wearos-detail-text">
                  <span className="wearos-detail-label">Type</span>
                  <span className="wearos-detail-value">{selectedAircraftDetail.Type}</span>
                </div>
              </div>

              {/* Altitude */}
              {selectedAircraftDetail.Altitude !== undefined && (
                <div className="wearos-detail">
                  <Mountain size={18} color={currentColors.primary} strokeWidth={2} />
                  <div className="wearos-detail-text">
                    <span className="wearos-detail-label">Altitude</span>
                    <span className="wearos-detail-value">
                      {selectedAircraftDetail.Altitude === 'ground' ? 'Ground' : `${Math.round(selectedAircraftDetail.Altitude)} ft`}
                    </span>
                  </div>
                </div>
              )}

              {/* Speed */}
              {selectedAircraftDetail.Speed !== undefined && (
                <div className="wearos-detail">
                  <Gauge size={18} color={currentColors.primary} strokeWidth={2} />
                  <div className="wearos-detail-text">
                    <span className="wearos-detail-label">Speed</span>
                    <span className="wearos-detail-value">{selectedAircraftDetail.Speed} km/h</span>
                  </div>
                </div>
              )}

              {/* Callsign */}
              {selectedAircraftDetail.Callsign && (
                <div className="wearos-detail">
                  <Radio size={18} color={currentColors.primary} strokeWidth={2} />
                  <div className="wearos-detail-text">
                    <span className="wearos-detail-label">Callsign</span>
                    <span className="wearos-detail-value">{selectedAircraftDetail.Callsign}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="wearos-footer">
              <div className="wearos-footer-stat">⏱ {countdown}s</div>
              <div className="wearos-footer-stat">✈ {aircraft.length}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WearOS;
