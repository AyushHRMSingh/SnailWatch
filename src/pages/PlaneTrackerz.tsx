import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useColors } from '../context/ColorContext';
import { ArrowLeft } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../App.css';

// ===== CONFIGURABLE TIMERS =====
const FETCH_INTERVAL_MS = 2500; // How often to fetch aircraft position (milliseconds)
const SEARCH_RADIUS_NM = 10;    // Search radius around last known position (nautical miles)
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
    lat?: number;
    lon?: number;
  };
  Destination?: {
    name: string;
    iata_code: string;
    municipality: string;
    country_name: string;
    lat?: number;
    lon?: number;
  };
  Airline?: {
    name: string;
    iata: string;
    country: string;
  };
}

function PlaneTrackerz() {
  const { currentColors } = useColors();
  const location = useLocation();
  const navigate = useNavigate();
  const { aircraft: passedAircraft, searchLat, searchLon } = location.state || {};
  
  const [trackedAircraft, setTrackedAircraft] = useState<AircraftDetail | null>(null);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(passedAircraft || null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentSearchLat, setCurrentSearchLat] = useState(searchLat);
  const [currentSearchLon, setCurrentSearchLon] = useState(searchLon);
  
  const trackingMapContainer = useRef<HTMLDivElement>(null);
  const trackingMap = useRef<maplibregl.Map | null>(null);
  const trackingPlaneMarker = useRef<maplibregl.Marker | null>(null);

  // Fetch aircraft by tracking its position
  useEffect(() => {
    if (!currentSearchLat || !currentSearchLon || !passedAircraft) return;

    const fetchAircraft = async () => {
      try {
        // Use configurable radius around the last known position to find the aircraft
        const url = `/api/lat/${currentSearchLat}/lon/${currentSearchLon}/dist/${SEARCH_RADIUS_NM}`;
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 429) {
            console.warn('Rate limited, will retry...');
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const currentAircraft = data.aircraft || [];
        
        // Find the tracked aircraft by ICAO hex
        const found = currentAircraft.find((ac: Aircraft) => ac.hex === passedAircraft.hex);
        if (found) {
          setSelectedAircraft(found);
          // Update search coordinates to the new position for next fetch
          setCurrentSearchLat(found.lat);
          setCurrentSearchLon(found.lon);
        } else {
          console.warn('Aircraft not found in current search area');
        }
      } catch (err) {
        console.error('Error fetching aircraft:', err);
      }
    };

    fetchAircraft();
    const interval = setInterval(fetchAircraft, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentSearchLat, currentSearchLon, passedAircraft]);

  // Update tracked aircraft details with live data
  useEffect(() => {
    if (!selectedAircraft || !trackedAircraft) return;

    setTrackedAircraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        Altitude: selectedAircraft.alt_baro,
        Speed: selectedAircraft.gs ? Math.round(selectedAircraft.gs * 1.852) : prev.Speed
      };
    });
  }, [selectedAircraft]);

  // Fetch detailed aircraft info
  useEffect(() => {
    if (!passedAircraft) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      const hex = passedAircraft.hex.replace('~', '');
      
      let aircraftDetail: AircraftDetail = {
        ICAO: hex,
        Registration: passedAircraft.r || 'Unknown',
        Manufacturer: '',
        Type: passedAircraft.t || 'Unknown',
        RegisteredOwners: '',
        Callsign: passedAircraft.flight?.trim(),
        Altitude: passedAircraft.alt_baro,
        Speed: passedAircraft.gs ? Math.round(passedAircraft.gs * 1.852) : undefined
      };
      
      try {
        try {
          const hexdbRes = await fetch(`https://hexdb.io/api/v1/aircraft/${hex}`);
          if (hexdbRes.ok) {
            const hexdbData = await hexdbRes.json();
            if (hexdbData.Registration) aircraftDetail.Registration = hexdbData.Registration;
            if (hexdbData.ICAOTypeCode) aircraftDetail.Manufacturer = hexdbData.ICAOTypeCode;
            if (hexdbData.Type) aircraftDetail.Type = hexdbData.Type;
            if (hexdbData.RegisteredOwners) aircraftDetail.RegisteredOwners = hexdbData.RegisteredOwners;
          }
        } catch (e) {
          console.log('hexdb.io failed (CORS or network issue)');
        }

        try {
          const adsbRes = await fetch(`https://api.adsbdb.com/v0/callsign/${passedAircraft.flight?.trim()}`);
          if (adsbRes.ok) {
            const adsbData = await adsbRes.json();
            if (adsbData.response && adsbData.response.flightroute) {
              const route = adsbData.response.flightroute;
              
              if (route.origin?.iata_code) {
                try {
                  const originRes = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(route.origin.name + ' airport')}&format=json&limit=1`
                  );
                  if (originRes.ok) {
                    const originData = await originRes.json();
                    if (originData[0]) {
                      route.origin.lat = parseFloat(originData[0].lat);
                      route.origin.lon = parseFloat(originData[0].lon);
                    }
                  }
                } catch (e) {
                  console.log('Failed to geocode origin');
                }
              }
              
              if (route.destination?.iata_code) {
                try {
                  const destRes = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(route.destination.name + ' airport')}&format=json&limit=1`
                  );
                  if (destRes.ok) {
                    const destData = await destRes.json();
                    if (destData[0]) {
                      route.destination.lat = parseFloat(destData[0].lat);
                      route.destination.lon = parseFloat(destData[0].lon);
                    }
                  }
                } catch (e) {
                  console.log('Failed to geocode destination');
                }
              }
              
              aircraftDetail.Origin = route.origin;
              aircraftDetail.Destination = route.destination;
            }
            
            if (adsbData.response && adsbData.response.aircraft) {
              const aircraftInfo = adsbData.response.aircraft;
              if (aircraftInfo.Manufacturer) aircraftDetail.Manufacturer = aircraftInfo.Manufacturer;
              if (aircraftInfo.Type) aircraftDetail.Type = aircraftInfo.Type;
            }
          }
        } catch (e) {
          console.log('Failed to fetch route from adsbdb');
        }
      } catch (err) {
        console.error('Error tracking aircraft:', err);
      }
      
      setTrackedAircraft(aircraftDetail);
      setIsLoading(false);
    };

    fetchDetails();
  }, [passedAircraft]);

  // Initialize tracking map (once)
  useEffect(() => {
    if (!trackedAircraft || !trackingMapContainer.current || !selectedAircraft) return;
    if (trackingMap.current) return; // Don't recreate if map exists

    const points: [number, number][] = [[selectedAircraft.lon, selectedAircraft.lat]];
    if (trackedAircraft.Origin?.lon && trackedAircraft.Origin?.lat) {
      points.push([trackedAircraft.Origin.lon, trackedAircraft.Origin.lat]);
    }
    if (trackedAircraft.Destination?.lon && trackedAircraft.Destination?.lat) {
      points.push([trackedAircraft.Destination.lon, trackedAircraft.Destination.lat]);
    }

    const mapInstance = new maplibregl.Map({
      container: trackingMapContainer.current,
      style: '/style.json',
      center: [selectedAircraft.lon, selectedAircraft.lat],
      zoom: 5
    });

    trackingMap.current = mapInstance;

    mapInstance.on('load', () => {
      if (trackedAircraft.Origin?.lon && trackedAircraft.Origin?.lat) {
        const originEl = document.createElement('div');
        originEl.innerHTML = '🛫';
        originEl.style.fontSize = '32px';
        originEl.title = `Origin: ${trackedAircraft.Origin.iata_code}`;
        new maplibregl.Marker({ element: originEl })
          .setLngLat([trackedAircraft.Origin.lon, trackedAircraft.Origin.lat])
          .addTo(mapInstance);
      }

      if (trackedAircraft.Destination?.lon && trackedAircraft.Destination?.lat) {
        const destEl = document.createElement('div');
        destEl.innerHTML = '🛬';
        destEl.style.fontSize = '32px';
        destEl.title = `Destination: ${trackedAircraft.Destination.iata_code}`;
        new maplibregl.Marker({ element: destEl })
          .setLngLat([trackedAircraft.Destination.lon, trackedAircraft.Destination.lat])
          .addTo(mapInstance);
      }

      const planeEl = document.createElement('div');
      planeEl.style.width = '48px';
      planeEl.style.height = '48px';
      planeEl.style.backgroundImage = 'url(/KL.svg)';
      planeEl.style.backgroundSize = 'contain';
      planeEl.style.backgroundRepeat = 'no-repeat';
      planeEl.style.backgroundPosition = 'center';
      
      const heading = selectedAircraft.track ?? selectedAircraft.dir ?? selectedAircraft.calc_track;
      const rotation = heading !== undefined ? heading : 0;

      const planeMarker = new maplibregl.Marker({ element: planeEl, rotation: rotation, rotationAlignment: 'map' })
        .setLngLat([selectedAircraft.lon, selectedAircraft.lat])
        .addTo(mapInstance);
      
      trackingPlaneMarker.current = planeMarker;

      if (trackedAircraft.Origin?.lon && trackedAircraft.Origin?.lat && 
          trackedAircraft.Destination?.lon && trackedAircraft.Destination?.lat) {
        mapInstance.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [trackedAircraft.Origin.lon, trackedAircraft.Origin.lat],
                [selectedAircraft.lon, selectedAircraft.lat],
                [trackedAircraft.Destination.lon, trackedAircraft.Destination.lat]
              ]
            },
            properties: {}
          }
        });

        mapInstance.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': currentColors.primary,
            'line-width': 3,
            'line-opacity': 0.6,
            'line-dasharray': [2, 2]
          }
        });
      }

      if (points.length > 1) {
        const bounds = points.reduce((bounds, coord) => {
          return bounds.extend(coord as [number, number]);
        }, new maplibregl.LngLatBounds(points[0], points[0]));

        mapInstance.fitBounds(bounds, { padding: 100 });
      }
    });
  }, [trackedAircraft, selectedAircraft, currentColors]);

  // Update plane marker position and route
  useEffect(() => {
    if (!trackingPlaneMarker.current || !selectedAircraft || !trackingMap.current) return;

    trackingPlaneMarker.current.setLngLat([selectedAircraft.lon, selectedAircraft.lat]);
    
    const heading = selectedAircraft.track ?? selectedAircraft.dir ?? selectedAircraft.calc_track;
    if (heading !== undefined) {
      trackingPlaneMarker.current.setRotation(heading);
    }

    // Update or create route
    if (trackedAircraft?.Origin?.lon && trackedAircraft?.Origin?.lat && 
        trackedAircraft?.Destination?.lon && trackedAircraft?.Destination?.lat) {
      
      const routeSource = trackingMap.current.getSource('route');
      if (routeSource) {
        // Update existing route
        (routeSource as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [trackedAircraft.Origin.lon, trackedAircraft.Origin.lat],
              [selectedAircraft.lon, selectedAircraft.lat],
              [trackedAircraft.Destination.lon, trackedAircraft.Destination.lat]
            ]
          },
          properties: {}
        });
      } else {
        // Create route if it doesn't exist yet
        trackingMap.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [trackedAircraft.Origin.lon, trackedAircraft.Origin.lat],
                [selectedAircraft.lon, selectedAircraft.lat],
                [trackedAircraft.Destination.lon, trackedAircraft.Destination.lat]
              ]
            },
            properties: {}
          }
        });

        trackingMap.current.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': currentColors.primary,
            'line-width': 3,
            'line-opacity': 0.6,
            'line-dasharray': [2, 2]
          }
        });
      }
    }
  }, [selectedAircraft, trackedAircraft, currentColors]);

  if (!passedAircraft) {
    return (
      <div className="App">
        <div className="radar-bg"></div>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: currentColors.primary
        }}>
          <h1>No Aircraft Selected</h1>
          <button
            onClick={() => navigate('/watcherz')}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: currentColors.primary,
              color: currentColors.bgDark,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Go to Plane Watcherz
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="radar-bg"></div>

      {isLoading ? (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: currentColors.primary,
          fontSize: '1.5rem'
        }}>
          Loading aircraft details...
        </div>
      ) : (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{
            padding: '20px',
            background: currentColors.bgDark,
            borderBottom: `2px solid ${currentColors.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: currentColors.primary,
            zIndex: 10001
          }}>
            <h2 style={{ margin: 0 }}>Tracking: {trackedAircraft?.Callsign || trackedAircraft?.Registration}</h2>
            <button
              onClick={() => navigate('/watcherz')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'transparent',
                border: `2px solid ${currentColors.primary}`,
                color: currentColors.primary,
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              <ArrowLeft size={20} />
              Back to Watcherz
            </button>
          </div>

          {/* Content Area */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Map */}
            <div style={{ flex: 1, position: 'relative' }}>
              <div ref={trackingMapContainer} style={{ width: '100%', height: '100%' }} />
            </div>

            {/* Stats Panel */}
            <div style={{
              width: '350px',
              padding: '20px',
              background: currentColors.background,
              borderLeft: `2px solid ${currentColors.primary}`,
              overflowY: 'auto',
              color: currentColors.primary
            }}>
              <h3 style={{ marginTop: 0 }}>Flight Details</h3>
              
              {trackedAircraft?.Origin && trackedAircraft?.Destination && (
                <div style={{ marginBottom: '20px' }}>
                  <p><strong>Route:</strong></p>
                  <p style={{ fontSize: '1.2rem' }}>
                    {trackedAircraft.Origin.iata_code} → {trackedAircraft.Destination.iata_code}
                  </p>
                  <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                    {trackedAircraft.Origin.name}<br/>
                    {trackedAircraft.Origin.municipality}, {trackedAircraft.Origin.country_name}
                  </p>
                  <p style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: '10px' }}>
                    {trackedAircraft.Destination.name}<br/>
                    {trackedAircraft.Destination.municipality}, {trackedAircraft.Destination.country_name}
                  </p>
                </div>
              )}

              <div style={{ marginBottom: '15px' }}>
                <p><strong>Registration:</strong> {trackedAircraft?.Registration}</p>
              </div>

              {trackedAircraft?.Type && (
                <div style={{ marginBottom: '15px' }}>
                  <p><strong>Aircraft Type:</strong> {trackedAircraft.Type}</p>
                </div>
              )}

              {trackedAircraft?.Manufacturer && (
                <div style={{ marginBottom: '15px' }}>
                  <p><strong>Manufacturer:</strong> {trackedAircraft.Manufacturer}</p>
                </div>
              )}

              {trackedAircraft?.RegisteredOwners && (
                <div style={{ marginBottom: '15px' }}>
                  <p><strong>Owner:</strong> {trackedAircraft.RegisteredOwners}</p>
                </div>
              )}

              <h3 style={{ marginTop: '30px' }}>Live Data</h3>

              {trackedAircraft?.Altitude !== undefined && (
                <div style={{ marginBottom: '15px' }}>
                  <p><strong>Altitude:</strong></p>
                  <p style={{ fontSize: '1.5rem', margin: '5px 0' }}>
                    {trackedAircraft.Altitude === 'ground' ? 'On Ground' : `${Math.round(trackedAircraft.Altitude as number)} ft`}
                  </p>
                </div>
              )}

              {trackedAircraft?.Speed !== undefined && (
                <div style={{ marginBottom: '15px' }}>
                  <p><strong>Ground Speed:</strong></p>
                  <p style={{ fontSize: '1.5rem', margin: '5px 0' }}>
                    {trackedAircraft.Speed} km/h
                  </p>
                </div>
              )}

              {selectedAircraft && (selectedAircraft.track ?? selectedAircraft.dir) !== undefined && (
                <div style={{ marginBottom: '15px' }}>
                  <p><strong>Heading:</strong></p>
                  <p style={{ fontSize: '1.5rem', margin: '5px 0' }}>
                    {Math.round(selectedAircraft.track ?? selectedAircraft.dir ?? 0)}°
                  </p>
                </div>
              )}

              {selectedAircraft && selectedAircraft.lat && selectedAircraft.lon && (
                <div style={{ marginBottom: '15px' }}>
                  <p><strong>Position:</strong></p>
                  <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                    Lat: {selectedAircraft.lat.toFixed(4)}<br/>
                    Lon: {selectedAircraft.lon.toFixed(4)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlaneTrackerz;
