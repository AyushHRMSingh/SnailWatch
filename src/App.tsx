import { useState, useEffect, useRef } from 'react';
import './App.css';
import { FileText, Plane, Factory, Users, Radio, Settings, X, Navigation, Mountain, Gauge, ExternalLink, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Typewriter hook
const useTypewriter = (text: string, speed: number = 50) => {
  const [displayText, setDisplayText] = useState('');
  
  useEffect(() => {
    if (!text) {
      setDisplayText('');
      return;
    }
    
    setDisplayText('');
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);
    
    return () => clearInterval(timer);
  }, [text, speed]);
  
  return displayText;
};

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
  track?: number; // Heading in degrees (0 = North)
  calc_track?: number; // Calculated track as fallback
  dir?: number; // Direction as another fallback
}

interface AircraftDetail {
  ICAO: string;
  Registration: string;
  Manufacturer: string;
  Type: string;
  RegisteredOwners: string;
  Callsign?: string;
  Altitude?: number | 'ground';
  Speed?: number; // Speed in km/h converted from Mach
  error?: string;
  // Route information
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

const TypewriterText = ({ text, speed = 50 }: { text: string; speed?: number }) => {
  const displayText = useTypewriter(text, speed);
  return <span>{displayText}</span>;
};

// Configuration: Set to false to skip loading the large local JSON database
// This speeds up loading over slow connections (e.g., ngrok tunnels)
const LOAD_LOCAL_DATABASE = false;

function App() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [selectedAircraftDetail, setSelectedAircraftDetail] = useState<AircraftDetail | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [icaoRepo, setIcaoRepo] = useState<any>(LOAD_LOCAL_DATABASE ? null : {});
  const [showSettings, setShowSettings] = useState(false);
  const [customLat, setCustomLat] = useState(() => localStorage.getItem('customLat') || '');
  const [customLon, setCustomLon] = useState(() => localStorage.getItem('customLon') || '');
  const [radius, setRadius] = useState(() => localStorage.getItem('radius') || '20');
  const [useCustomLocation, setUseCustomLocation] = useState(() => localStorage.getItem('useCustomLocation') === 'true');
  const [isLoadingRepo, setIsLoadingRepo] = useState(LOAD_LOCAL_DATABASE);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false'); // Default true
  const [colorMode, setColorMode] = useState<'classic' | 'pns'>(() => (localStorage.getItem('colorMode') as 'classic' | 'pns') || 'pns');

  const previousAircraft = useRef(new Set<string>());
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const planeMarker = useRef<maplibregl.Marker | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousLocation = useRef<{ lat: number; lon: number } | null>(null);
  const previousRadius = useRef<string | null>(null);
  const REFRESH_INTERVAL = 10; // Increased to avoid rate limiting

  // Color schemes
  const colorSchemes = {
    classic: {
      primary: '#00ff00',
      secondary: '#00ff88',
      accent: '#00ff44',
      background: 'rgba(0,32,0,0.95)',
      bgDark: '#000800',
      shadow: 'rgba(0,255,0,0.8)',
    },
    pns: {
      primary: 'rgb(218, 193, 93)',
      secondary: 'rgb(255, 255, 255)',
      accent: 'rgb(16, 8, 82)',
      background: 'rgba(16, 8, 82, 0.95)',
      bgDark: 'rgb(16, 8, 82)',
      shadow: 'rgba(218, 193, 93, 0.8)',
    },
  };

  const currentColors = colorSchemes[colorMode];

  const resetMapView = () => {
    if (!map.current || !userLocation) return;
    
    // Calculate bounds based on scanner range
    const radiusInMeters = parseFloat(radius) * 1852; // Convert NM to meters
    const latDelta = (radiusInMeters / 111320);
    const lonDelta = (radiusInMeters / (111320 * Math.cos(userLocation.lat * Math.PI / 180)));
    
    const bounds: [[number, number], [number, number]] = [
      [userLocation.lon - lonDelta, userLocation.lat - latDelta],
      [userLocation.lon + lonDelta, userLocation.lat + latDelta]
    ];
    
    map.current.fitBounds(bounds, {
      padding: 0,
      duration: 1000
    });
  };

  const fetchAircraftDetails = async (hex: string, callsign?: string, altitude?: number | 'ground', mach?: number, groundSpeed?: number, aircraftData?: Aircraft) => {
    // Convert Mach to km/h (Mach 1 ≈ 1234.8 km/h at sea level), or use ground speed (knots to km/h)
    let speedKmh: number | undefined;
    if (mach) {
      speedKmh = Math.round(mach * 1234.8);
    } else if (groundSpeed) {
      speedKmh = Math.round(groundSpeed * 1.852); // Convert knots to km/h
    }
    
    // IMMEDIATELY set default values from initial aircraft data
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
      
      // Show reveal animation and set default data immediately
      setIsRevealing(true);
      setSelectedAircraftDetail(defaultDetails);
      setTimeout(() => {
        setIsRevealing(false);
      }, 1500);
    }
    
    try {
      console.log('Fetching details for hex:', hex, 'callsign:', callsign);
      
      // Try adsbdb.com as PRIMARY API
      try {
        console.log('Trying adsbdb.com (PRIMARY)...');
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
            
            // Add route information if available
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
            
            // OVERWRITE default data immediately (no reveal animation)
            setSelectedAircraftDetail(details);
            console.log('✓ adsbdb.com (PRIMARY) succeeded - data overwritten');
            return;
          }
        }
        console.log('adsbdb.com failed, trying fallbacks...');
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
          // OVERWRITE default data immediately
          setSelectedAircraftDetail(details);
          console.log('✓ Custom API succeeded - data overwritten');
          return;
        }
        console.log('Custom API failed, trying hexdb.io...');
      } catch (err) {
        console.log('Custom API error:', err);
      }

      // Try hexdb.io
      try {
        console.log('Trying hexdb.io...');
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
            // OVERWRITE default data immediately
            setSelectedAircraftDetail(details);
            console.log('✓ hexdb.io succeeded - data overwritten');
            return;
          }
        }
        console.log('hexdb.io failed, trying local JSON...');
      } catch (err) {
        console.log('hexdb.io error:', err);
      }

      // Try local ICAO repo JSON as LAST resort
      if (icaoRepo) {
        console.log('Trying local ICAO repo as last resort...');
        const hexUpper = hex.toUpperCase();
        console.log('Looking up hex:', hexUpper, 'in repo with', Object.keys(icaoRepo).length, 'entries');
        const localData = icaoRepo[hexUpper];
        console.log('Local data found:', localData);
        if (localData) {
          // Build details from whatever fields are available
          const registration = localData.reg || localData.r || localData.registration || null;
          const manufacturer = localData.manufacturer || localData.m || null;
          const type = localData.icaotype || localData.t || localData.type || localData.short_type || null;
          const owner = localData.ownop || localData.o || localData.owner || null;
          const model = localData.model || null;
          
          console.log('Parsed data:', { registration, manufacturer, type, owner, model, rawData: localData });
          
          // Build the details object with whatever we have
          const details: AircraftDetail = {
            ICAO: hex,
            Registration: registration || hex,
            Manufacturer: manufacturer || (model ? model : 'Unknown'),
            Type: type || 'Unknown',
            RegisteredOwners: owner || 'Unknown',
            Callsign: callsign,
            Altitude: altitude,
            Speed: speedKmh,
          };
          // OVERWRITE default data immediately
          setSelectedAircraftDetail(details);
          console.log('✓ Local ICAO repo succeeded - data overwritten');
          return;
        } else {
          console.log('No entry found in local repo for hex:', hexUpper);
        }
      } else {
        console.log('ICAO repo not loaded yet');
      }

      // All sources failed - keep the original default data that was already set
      console.log('✗ All sources failed - keeping default data from initial aircraft response');
      // Don't overwrite - the default data from aircraftData is already displayed
    } catch (err) {
      console.error('Error in fetchAircraftDetails:', err);
      // Don't overwrite - keep the default data that was already set
    }
  };

  const fetchData = async () => {
    if (!userLocation) {
      console.log('Waiting for location...');
      return;
    }
    
    // Don't block on icaoRepo - it's optional now
    
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
        
        const newAircraft = newEntries[0];
        fetchAircraftDetails(
          newAircraft.hex.replace('~', ''),
          newAircraft.flight?.trim(),
          newAircraft.alt_baro,
          newAircraft.mach,
          newAircraft.gs,
          newAircraft  // Pass the full aircraft object for default data
        );
        
        // Play beep sound with delay to sync with reveal animation
        setTimeout(() => {
          if (audioRef.current && soundEnabled) {
            audioRef.current.currentTime = 0; // Reset to start
            audioRef.current.play().catch(err => console.log('Audio play failed:', err));
          }
        }, 300); // 300ms delay to sync with reveal animation
      }

      setAircraft(currentAircraft);
      previousAircraft.current = currentHexCodes;
    } catch (err) {
      console.error('Error fetching aircraft:', err);
    }
  };

  useEffect(() => {
    console.log('useEffect running, LOAD_LOCAL_DATABASE:', LOAD_LOCAL_DATABASE);
    
    // Check if local database loading is enabled
    if (!LOAD_LOCAL_DATABASE) {
      console.log('Local database loading disabled - using remote APIs only');
      setIcaoRepo({}); // Set empty object so app doesn't wait
      setIsLoadingRepo(false);
      console.log('icaoRepo set to empty object, isLoadingRepo set to false');
      return;
    }
    
    // Load ICAO repo JSON on startup
    console.log('Loading ICAO repository...');
    setIsLoadingRepo(true);
    setLoadingProgress(0);
    
    fetch('/icaorepo.json')
      .then(res => {
        setLoadingProgress(20);
        return res.text();
      })
      .then(async text => {
        // Artificial delay to show progress
        await new Promise(resolve => setTimeout(resolve, 300));
        setLoadingProgress(40);
        
        await new Promise(resolve => setTimeout(resolve, 200));
        const icaoMap: any = {};
        
        // Try parsing as regular JSON first
        try {
          const data = JSON.parse(text);
          setLoadingProgress(60);
          await new Promise(resolve => setTimeout(resolve, 300));
          
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
          setLoadingProgress(80);
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (e) {
          // If regular JSON fails, try NDJSON (newline-delimited JSON)
          console.log('Parsing as NDJSON...');
          setLoadingProgress(60);
          await new Promise(resolve => setTimeout(resolve, 300));
          
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
          setLoadingProgress(80);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        setLoadingProgress(90);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        setIcaoRepo(icaoMap);
        console.log(`✓ ICAO repository loaded (${Object.keys(icaoMap).length} entries)`);
        
        // Ensure progress reaches 100% and stays visible
        setLoadingProgress(100);
        await new Promise(resolve => setTimeout(resolve, 800));
        setIsLoadingRepo(false);
      })
      .catch(err => {
        console.error('Failed to load ICAO repo:', err);
        setLoadingProgress(100);
        setTimeout(() => {
          setIsLoadingRepo(false);
        }, 500);
      });
  }, []);

  // Separate useEffect for geolocation
  useEffect(() => {
    // Check if custom location is set in localStorage
    const savedUseCustom = localStorage.getItem('useCustomLocation') === 'true';
    const savedLat = localStorage.getItem('customLat');
    const savedLon = localStorage.getItem('customLon');
    
    if (savedUseCustom && savedLat && savedLon) {
      // Load from custom location
      const lat = parseFloat(savedLat);
      const lon = parseFloat(savedLon);
      if (!isNaN(lat) && !isNaN(lon)) {
        console.log('Loading custom location from localStorage:', lat, lon);
        setUserLocation({ lat, lon });
        setLocationError(null);
        return;
      }
    }
    
    // Otherwise, get user's location from geolocation
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
          let errorMsg = 'Location access denied';
          if (error.code === 1) errorMsg = 'Location permission denied';
          else if (error.code === 2) errorMsg = 'Location unavailable';
          else if (error.code === 3) errorMsg = 'Location timeout';
          setLocationError(errorMsg + ' - Using default location (LAX)');
          // Fallback to default location (LAX area)
          setUserLocation({ lat: 33.9416, lon: -118.4085 });
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      console.error('Geolocation not supported');
      setLocationError('Geolocation not supported - Using default location (LAX)');
      setUserLocation({ lat: 33.9416, lon: -118.4085 });
    }
  }, []);

  useEffect(() => {
    console.log('fetchData useEffect triggered, userLocation:', userLocation);
    if (!userLocation) {
      console.log('No userLocation yet, waiting...');
      return;
    }
    
    console.log('Starting fetchData and interval');
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [userLocation, radius]);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Apply color scheme to CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', currentColors.primary);
    root.style.setProperty('--color-secondary', currentColors.secondary);
    root.style.setProperty('--color-accent', currentColors.accent);
    root.style.setProperty('--color-background', currentColors.background);
    root.style.setProperty('--color-bg-dark', currentColors.bgDark);
    root.style.setProperty('--color-shadow', currentColors.shadow);
  }, [colorMode]);

  // Initialize map when aircraft is selected
  useEffect(() => {
    if (!mapContainer.current || !userLocation || !selectedAircraftDetail) return;

    // Find the selected aircraft in the aircraft list to get its coordinates
    const selectedAircraft = aircraft.find(ac => ac.hex === selectedAircraftDetail.ICAO);
    if (!selectedAircraft) return;

    // Check if location or radius has changed
    const locationChanged = previousLocation.current && 
      (previousLocation.current.lat !== userLocation.lat || 
       previousLocation.current.lon !== userLocation.lon);
    const radiusChanged = previousRadius.current && previousRadius.current !== radius;

    // Recreate map if it doesn't exist OR if location/radius changed
    if (!map.current || locationChanged || radiusChanged) {
      // Remove old markers and map if they exist
      if (planeMarker.current) {
        planeMarker.current.remove();
        planeMarker.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }

      // Update previous location and radius
      previousLocation.current = { lat: userLocation.lat, lon: userLocation.lon };
      previousRadius.current = radius;
      // Calculate bounds based on scanner range
      const radiusInMeters = parseFloat(radius) * 1852; // Convert NM to meters
      
      // Calculate lat/lon deltas
      const latDelta = (radiusInMeters / 111320); // 1 degree latitude ≈ 111,320 meters
      const lonDelta = (radiusInMeters / (111320 * Math.cos(userLocation.lat * Math.PI / 180)));
      
      // Calculate bounds
      const bounds: [[number, number], [number, number]] = [
        [userLocation.lon - lonDelta, userLocation.lat - latDelta], // Southwest
        [userLocation.lon + lonDelta, userLocation.lat + latDelta]  // Northeast
      ];

      // Create new map with bounds
      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: '/style.json',
        bounds: bounds,
        fitBoundsOptions: {
          padding: 0
        }
      });

      map.current = mapInstance;

      // Wait for map to load before adding marker and range circle
      mapInstance.on('load', () => {
      // Convert nautical miles to meters (1 NM = 1852 meters)
      const radiusInMeters = parseFloat(radius) * 1852;
      
      // Create a circle representing the scanner range
      // Calculate circle points
      const points = 64;
      const coords: [number, number][] = [];
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * 2 * Math.PI;
        const dx = radiusInMeters * Math.cos(angle);
        const dy = radiusInMeters * Math.sin(angle);
        
        // Convert meters to degrees (approximate)
        const deltaLat = dy / 111320;
        const deltaLon = dx / (111320 * Math.cos(userLocation.lat * Math.PI / 180));
        
        coords.push([
          userLocation.lon + deltaLon,
          userLocation.lat + deltaLat
        ]);
      }
      // Close the circle
      coords.push(coords[0]);

      // Add the circle as a source and layer
      mapInstance.addSource('scanner-range', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [coords]
          },
          properties: {}
        }
      });

      mapInstance.addLayer({
        id: 'scanner-range-fill',
        type: 'fill',
        source: 'scanner-range',
        paint: {
          'fill-color': currentColors.primary,
          'fill-opacity': 0.1
        }
      });

      mapInstance.addLayer({
        id: 'scanner-range-outline',
        type: 'line',
        source: 'scanner-range',
        paint: {
          'line-color': currentColors.primary,
          'line-width': 2,
          'line-opacity': 0.8
        }
      });

      // Add user location marker
      const userMarkerEl = document.createElement('div');
      userMarkerEl.className = 'user-marker';
      userMarkerEl.innerHTML = '📍';
      userMarkerEl.style.fontSize = '24px';
      
      new maplibregl.Marker({ element: userMarkerEl })
        .setLngLat([userLocation.lon, userLocation.lat])
        .addTo(mapInstance);

      // Create a custom plane icon
      const el = document.createElement('div');
      el.className = 'plane-marker';
      el.innerHTML = '✈️';
      el.style.fontSize = '24px';
      el.style.cursor = 'pointer';
      // Rotate based on track (heading), use calc_track or dir as fallback
      const heading = selectedAircraft.track ?? selectedAircraft.calc_track ?? selectedAircraft.dir;
      if (heading !== undefined) {
        el.style.transform = `rotate(${heading}deg)`;
      }

      // Add plane marker at aircraft's location
      planeMarker.current = new maplibregl.Marker({ element: el, rotation: heading || 0 })
        .setLngLat([selectedAircraft.lon, selectedAircraft.lat])
        .addTo(mapInstance);
      });
    } else if (map.current) {
      // Map exists, update or create the plane marker
      if (planeMarker.current) {
        // Update existing marker position and rotation
        planeMarker.current.setLngLat([selectedAircraft.lon, selectedAircraft.lat]);
        
        // Update rotation if heading changed
        const heading = selectedAircraft.track ?? selectedAircraft.calc_track ?? selectedAircraft.dir;
        if (heading !== undefined) {
          const el = planeMarker.current.getElement();
          el.style.transform = `rotate(${heading}deg)`;
        }
      } else {
        // Create new marker only if it doesn't exist
        const el = document.createElement('div');
        el.className = 'plane-marker';
        el.innerHTML = '✈️';
        el.style.fontSize = '24px';
        el.style.cursor = 'pointer';
        // Rotate based on track (heading), use calc_track or dir as fallback
        const heading = selectedAircraft.track ?? selectedAircraft.calc_track ?? selectedAircraft.dir;
        if (heading !== undefined) {
          el.style.transform = `rotate(${heading}deg)`;
        }

        planeMarker.current = new maplibregl.Marker({ element: el, rotation: heading || 0 })
          .setLngLat([selectedAircraft.lon, selectedAircraft.lat])
          .addTo(map.current);
      }
    }
    
    // Cleanup function to remove marker when component unmounts or aircraft changes
    return () => {
      if (planeMarker.current && !selectedAircraftDetail) {
        planeMarker.current.remove();
        planeMarker.current = null;
      }
    };
  }, [selectedAircraftDetail, aircraft, userLocation, radius, colorMode]);

  return (
    <div className="App">
      <div className="radar-bg"></div>
      
      {/* Hidden audio element for sonar sound */}
      <audio ref={audioRef} src="/sonar.mp3" preload="auto" />

      {isLoadingRepo && (
        <div className="loading-overlay">
          <div className="loading-content">
            <Radio size={80} color={currentColors.primary} strokeWidth={2} className="loading-icon" />
            <h1 className="loading-text">LOADING DATABASE</h1>
            <div className="loading-bar">
              <div className="loading-progress" style={{ width: `${loadingProgress}%` }}></div>
            </div>
            <p className="loading-percentage">{Math.round(loadingProgress)}%</p>
          </div>
        </div>
      )}

      {isRevealing && (
        <div className="reveal-overlay reveal-overlay-enter">
          <div className="reveal-content">
            <Radio size={80} color={currentColors.primary} strokeWidth={2} style={{ marginBottom: '1rem', filter: `drop-shadow(0 0 20px ${currentColors.shadow})` }} />
            <h1 className="glitch-text">NEW AIRCRAFT DETECTED</h1>
          </div>
        </div>
      )}

      <button 
        className="settings-button"
        onClick={() => setShowSettings(true)}
        aria-label="Settings"
      >
        <Settings size={24} color={currentColors.primary} />
      </button>

      <button 
        className="sound-toggle-button"
        onClick={() => {
          const newSoundState = !soundEnabled;
          setSoundEnabled(newSoundState);
          localStorage.setItem('soundEnabled', newSoundState.toString());
        }}
        aria-label="Toggle Sound"
      >
        {soundEnabled ? <Volume2 size={24} color={currentColors.primary} /> : <VolumeX size={24} color="#ff0000" />}
      </button>

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-popup" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>SETTINGS</h2>
              <button className="close-button" onClick={() => setShowSettings(false)}>
                <X size={24} color={currentColors.primary} />
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
                <label>Radius (NM)</label>
                <input 
                  type="text" 
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  placeholder="e.g., 20"
                  className="settings-input"
                />
              </div>

              <div className="settings-section">
                <label>Color Mode</label>
                <div className="color-mode-buttons">
                  <button
                    className={`color-mode-button ${colorMode === 'classic' ? 'active' : ''}`}
                    onClick={() => {
                      setColorMode('classic');
                      localStorage.setItem('colorMode', 'classic');
                    }}
                  >
                    Classic Radar
                  </button>
                  <button
                    className={`color-mode-button ${colorMode === 'pns' ? 'active' : ''}`}
                    onClick={() => {
                      setColorMode('pns');
                      localStorage.setItem('colorMode', 'pns');
                    }}
                  >
                    PnS
                  </button>
                </div>
              </div>

              <button 
                className="apply-button"
                onClick={() => {
                  // Save settings to localStorage
                  localStorage.setItem('customLat', customLat);
                  localStorage.setItem('customLon', customLon);
                  localStorage.setItem('radius', radius);
                  localStorage.setItem('useCustomLocation', useCustomLocation.toString());
                  
                  // Clear the aircraft card when changing location
                  setSelectedAircraftDetail(null);
                  previousAircraft.current.clear();
                  
                  if (useCustomLocation && customLat && customLon) {
                    // Use custom location
                    const lat = parseFloat(customLat);
                    const lon = parseFloat(customLon);
                    if (!isNaN(lat) && !isNaN(lon)) {
                      setUserLocation({ lat, lon });
                      setLocationError(null);
                    } else {
                      setLocationError('Invalid coordinates');
                    }
                  } else if (!useCustomLocation) {
                    // Switch back to automatic geolocation
                    if ('geolocation' in navigator) {
                      navigator.geolocation.getCurrentPosition(
                        (position) => {
                          const { latitude, longitude } = position.coords;
                          setUserLocation({ lat: latitude, lon: longitude });
                          setLocationError(null);
                        },
                        (error) => {
                          console.error('Geolocation error:', error);
                          setLocationError('Could not get location - Using default (LAX)');
                          setUserLocation({ lat: 33.9416, lon: -118.4085 });
                        }
                      );
                    } else {
                      setLocationError('Geolocation not supported');
                      setUserLocation({ lat: 33.9416, lon: -118.4085 });
                    }
                  }
                  setShowSettings(false);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="App-header">
        <h1>PlaneWatch</h1>
        <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '-0.5rem', marginBottom: '0.5rem', fontStyle: 'italic' }}>
          by Plane and Simple
        </p>
        {userLocation && (
          <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>
            📍 {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)} • {radius} NM radius
          </p>
        )}
        {locationError && (
          <p style={{ fontSize: '0.9rem', color: '#ffaa00' }}>⚠️ {locationError}</p>
        )}
      </header>

      {/* Always show the card */}
      <div className="details-card details-card-enter">
        <div className="card-content-wrapper">
          <div className="card-info">
        {!selectedAircraftDetail ? (
          <>
            <div className="card-header card-header-enter">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Radio size={32} color={currentColors.primary} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 8px ${currentColors.shadow})` }} />
                <h2><TypewriterText text="SCANNING..." speed={80} /></h2>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>
                <div>⏱ {countdown}s</div>
                <div>Tracking: {aircraft.length}</div>
              </div>
            </div>
          </>
        ) : selectedAircraftDetail.error ? (
          <div className="detail-item detail-item-1">
            <p>Aircraft <strong><TypewriterText text={selectedAircraftDetail.Registration} speed={40} /></strong> <TypewriterText text={selectedAircraftDetail.error} speed={30} /></p>
          </div>
        ) : (
          <>
            <div className="card-header card-header-enter">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plane size={32} color={currentColors.primary} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 8px ${currentColors.shadow})` }} />
                <h2><TypewriterText text="AIRCRAFT IDENTIFIED" speed={80} /></h2>
                  <a 
                    href={`https://www.flightradar24.com/${selectedAircraftDetail.Registration.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginLeft: '10px', display: 'inline-flex', alignItems: 'center' }}
                    title="View on FlightRadar24"
                  >
                    <ExternalLink size={24} color={currentColors.primary} strokeWidth={2} />
                  </a>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>
                  <div>⏱ {countdown}s</div>
                  <div>Tracking: {aircraft.length}</div>
                </div>
              </div>
              {selectedAircraftDetail.Origin && selectedAircraftDetail.Destination && (
                <div className="detail-item detail-item-1">
                  <Navigation size={24} color={currentColors.primary} strokeWidth={2} />
                  <p>
                    <strong>Route:</strong>{' '}
                    <span 
                      className="airport-code"
                      data-tooltip={`${selectedAircraftDetail.Origin.name}, ${selectedAircraftDetail.Origin.municipality}, ${selectedAircraftDetail.Origin.country_name}`}
                    >
                      {selectedAircraftDetail.Origin.iata_code}
                    </span>
                    {' → '}
                    <span 
                      className="airport-code"
                      data-tooltip={`${selectedAircraftDetail.Destination.name}, ${selectedAircraftDetail.Destination.municipality}, ${selectedAircraftDetail.Destination.country_name}`}
                    >
                      {selectedAircraftDetail.Destination.iata_code}
                    </span>
                  </p>
                </div>
              )}
              {selectedAircraftDetail.Airline && (
                <div className="detail-item detail-item-2">
                  <Plane size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Airline:</strong> <TypewriterText text={`${selectedAircraftDetail.Airline.name} (${selectedAircraftDetail.Airline.iata})`} speed={60} /></p>
                </div>
              )}
              <div className="detail-item detail-item-3">
                <FileText size={24} color={currentColors.primary} strokeWidth={2} />
                <p><strong>Registration:</strong> <TypewriterText text={selectedAircraftDetail.Registration} speed={60} /></p>
              </div>
              <div className="detail-item detail-item-4">
                <Plane size={24} color={currentColors.primary} strokeWidth={2} />
                <p><strong>Type:</strong> <TypewriterText text={selectedAircraftDetail.Type} speed={60} /></p>
              </div>
              <div className="detail-item detail-item-5">
                <Factory size={24} color={currentColors.primary} strokeWidth={2} />
                <p><strong>Manufacturer:</strong> <TypewriterText text={selectedAircraftDetail.Manufacturer} speed={60} /></p>
              </div>
              <div className="detail-item detail-item-6">
                <Users size={24} color={currentColors.primary} strokeWidth={2} />
                <p><strong>Owner:</strong> <TypewriterText text={selectedAircraftDetail.RegisteredOwners} speed={60} /></p>
              </div>
              {selectedAircraftDetail.Callsign && (
                <div className="detail-item detail-item-7">
                  <Navigation size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Callsign:</strong> <TypewriterText text={selectedAircraftDetail.Callsign} speed={60} /></p>
                </div>
              )}
              {selectedAircraftDetail.Altitude !== undefined && (
                <div className="detail-item detail-item-8">
                  <Mountain size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Altitude:</strong> <TypewriterText text={selectedAircraftDetail.Altitude === 'ground' ? 'On Ground' : `${Math.round(selectedAircraftDetail.Altitude)} ft`} speed={60} /></p>
                </div>
              )}
              {selectedAircraftDetail.Speed !== undefined && (
                <div className="detail-item detail-item-9">
                  <Gauge size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Speed:</strong> <TypewriterText text={`${selectedAircraftDetail.Speed} km/h`} speed={60} /></p>
                </div>
              )}
              <div className="detail-item detail-item-10">
                <Radio size={24} color={currentColors.primary} strokeWidth={2} />
                <p><strong>ICAO:</strong> <TypewriterText text={selectedAircraftDetail.ICAO} speed={60} /></p>
              </div>
            </>
            )}
          </div>
          <div className="card-map">
            <div ref={mapContainer} className="map-container" id="mapa" />
          </div>
        </div>
        {selectedAircraftDetail && (
          <button 
            className="reset-map-button"
            onClick={resetMapView}
            title="Reset map view"
          >
            <RotateCcw size={20} color={currentColors.primary} />
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
