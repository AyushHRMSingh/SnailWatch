import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { FileText, Plane, Factory, Users, Radio, Settings, X, Navigation, Mountain, Gauge, ExternalLink, Volume2, VolumeX, RotateCcw, Filter } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useColors } from './context/ColorContext';

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
  track?: number; // Heading in degrees (0 = North)
  calc_track?: number; // Calculated track as fallback
  dir?: number; // Direction as another fallback
}

interface AircraftDetail {
  ICAO: string;
  Registration: string;
  Manufacturer: string;
  Model: string;
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

// Configuration: Set to false to skip loading the large local JSON database
// This speeds up loading over slow connections (e.g., ngrok tunnels)
const LOAD_LOCAL_DATABASE = false;

function App() {
  const { colorMode, setColorMode, currentColors } = useColors();
  const [allAircraft, setAllAircraft] = useState<Aircraft[]>([]); // Store ALL aircraft from API
  const [aircraft, setAircraft] = useState<Aircraft[]>([]); // Filtered aircraft for display
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
  const [dataSource, setDataSource] = useState<'adsb.fi' | 'airplanes.live'>(() => (localStorage.getItem('dataSource') as 'adsb.fi' | 'airplanes.live') || 'adsb.fi');
  const [showNonStandardADSB, setShowNonStandardADSB] = useState(() => localStorage.getItem('showNonStandardADSB') === 'true'); // Default false
  const [devMode, setDevMode] = useState(() => localStorage.getItem('devMode') === 'true');
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
  const planeMarker = useRef<maplibregl.Marker | null>(null);
  const allMarkers = useRef<maplibregl.Marker[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousLocation = useRef<{ lat: number; lon: number } | null>(null);
  const previousRadius = useRef<string | null>(null);
  const fetchCounter = useRef(0); // Counter to track fetch cycles

  const resetMapView = () => {
    if (!map.current || !userLocation) return;
    
    // Only adjust map positioning - do NOT remove markers
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
        Model: aircraftData.desc || (aircraftData.t && !aircraftData.t.includes('tisb') && !aircraftData.t.includes('adsb') && !aircraftData.t.includes('adsr') ? aircraftData.t : 'Unknown'),
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
              Model: aircraft.type || aircraft.icao_type || 'Unknown',
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
              Model: hexdbData.Type || hexdbData.ICAOTypeCode || 'Unknown',
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
            Model: type || 'Unknown',
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

  // Function to check if aircraft matches ANY of the selected filters
  const matchesFilter = (aircraft: Aircraft): boolean => {
    if (selectedPlaneFilters.size === 0 || !planesDatabase) return true;
    
    const aircraftType = aircraft.t || aircraft.desc || '';
    let matchedAnyKnownPlane = false;
    
    // Check if aircraft matches ANY of the selected plane models
    for (const manufacturer of planesDatabase.planes) {
      for (const model of manufacturer.models) {
        // Check if this aircraft matches this model's regex
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
          // If this model is selected, aircraft passes filter
          if (selectedPlaneFilters.has(model.plane_name)) {
            return true;
          }
        }
      }
    }
    
    // If aircraft didn't match any known plane and "Others" is selected, show it
    if (!matchedAnyKnownPlane && selectedPlaneFilters.has(OTHERS_FILTER)) {
      return true;
    }
    
    return false; // No matches found
  };

  const fetchData = useCallback(async () => {
    if (!userLocation) {
      console.log('Waiting for location...');
      return;
    }
    
    // Increment fetch counter
    fetchCounter.current += 1;
    const shouldCheckNewPlanes = fetchCounter.current % REFRESH_INTERVAL === 0;
    
    // Don't block on icaoRepo - it's optional now
    
    console.log('Fetching aircraft list from', dataSource, '(check new planes:', shouldCheckNewPlanes, ')');
    
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
        // airplanes.live returns array directly with different field names
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

      // Only check for new planes every REFRESH_INTERVAL seconds
      if (shouldCheckNewPlanes) {
        setCountdown(REFRESH_INTERVAL);

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
    
    console.log(`Starting fetchData and interval (fetching every ${FETCH_INTERVAL_MS}ms)`);
    fetchData();
    const interval = setInterval(fetchData, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userLocation, radius, dataSource, fetchData]);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize map when user location is available
  useEffect(() => {
    if (!mapContainer.current || !userLocation) return;

    // Find the selected aircraft in the aircraft list to get its coordinates (if any)
    const selectedAircraft = selectedAircraftDetail 
      ? aircraft.find(ac => ac.hex === selectedAircraftDetail.ICAO)
      : null;

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
      
      const userMarker = new maplibregl.Marker({ element: userMarkerEl })
        .setLngLat([userLocation.lon, userLocation.lat])
        .addTo(mapInstance);
      
      allMarkers.current.push(userMarker);

      // Add markers for ALL aircraft
      aircraft.forEach((plane) => {
        const isSelected = selectedAircraft && plane.hex === selectedAircraft.hex;
        const el = document.createElement('div');
        el.className = isSelected ? 'selected-plane-marker' : 'plane-marker';
        el.style.width = isSelected ? '40px' : '32px';
        el.style.height = isSelected ? '40px' : '32px';
        el.style.cursor = 'pointer';
        el.style.backgroundImage = isSelected ? 'url(/blank_plane.png)' : 'url(/blank_plane.png)';
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
        el.style.transformOrigin = 'center center';
        el.style.zIndex = isSelected ? '1000' : '1';
        
        // Rotate based on track (heading)
        // Aviation heading: 0° = North, 90° = East, 180° = South, 270° = West
        const heading = plane.track ?? plane.dir ?? plane.calc_track;
        console.log('Heading:', heading, 'for plane:', plane.hex);
        // MapLibre rotation: 0° = East, so we need to add 90° to convert from North-based heading
        const rotation = heading !== undefined ? heading : 0;

        const marker = new maplibregl.Marker({ 
          element: el, 
          rotation: rotation,
          rotationAlignment: 'map'
        })
          .setLngLat([plane.lon, plane.lat])
          .addTo(mapInstance);
        
        allMarkers.current.push(marker);
        
        // Store selected plane marker reference
        if (isSelected) {
          planeMarker.current = marker;
        }
      });
      });
    } else if (map.current) {
      // Map exists - clear all markers and recreate them (except user marker)
      // Remove all existing markers
      allMarkers.current.forEach(marker => marker.remove());
      allMarkers.current = [];
      
      if (planeMarker.current) {
        planeMarker.current.remove();
        planeMarker.current = null;
      }
      
      const mapInstance = map.current;
      
      // Recreate user location marker
      const userMarkerEl = document.createElement('div');
      userMarkerEl.className = 'user-marker';
      userMarkerEl.innerHTML = '📍';
      userMarkerEl.style.fontSize = '24px';
      
      const userMarker = new maplibregl.Marker({ element: userMarkerEl })
        .setLngLat([userLocation.lon, userLocation.lat])
        .addTo(mapInstance);
      
      allMarkers.current.push(userMarker);
      
      // Add markers for ALL aircraft
      aircraft.forEach((plane) => {
        const isSelected = selectedAircraft && plane.hex === selectedAircraft.hex;
        const el = document.createElement('div');
        el.className = isSelected ? 'selected-plane-marker' : 'plane-marker';
        el.style.width = isSelected ? '40px' : '32px';
        el.style.height = isSelected ? '40px' : '32px';
        el.style.cursor = 'pointer';
        el.style.backgroundImage = isSelected ? 'url(/blank_plane.png)' : 'url(/blank_plane.png)';
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
        el.style.transformOrigin = 'center center';
        el.style.zIndex = isSelected ? '1000' : '1';
        
        // Rotate based on track (heading)
        // Aviation heading: 0° = North, 90° = East, 180° = South, 270° = West
        const heading = plane.track ?? plane.dir ?? plane.calc_track;
        // MapLibre rotation: 0° = East, so we need to add 90° to convert from North-based heading
        const rotation = heading !== undefined ? heading : 0;

        const marker = new maplibregl.Marker({ 
          element: el, 
          rotation: rotation,
          rotationAlignment: 'map'
        })
          .setLngLat([plane.lon, plane.lat])
          .addTo(mapInstance);
        
        allMarkers.current.push(marker);
        
        // Store selected plane marker reference
        if (isSelected) {
          planeMarker.current = marker;
        }
      });
    }
    
    // Cleanup function to remove marker when component unmounts or aircraft changes
    return () => {
      if (planeMarker.current && !selectedAircraftDetail) {
        planeMarker.current.remove();
        planeMarker.current = null;
      }
    };
  }, [selectedAircraftDetail, aircraft, userLocation, radius, currentColors]);

  // Separate effect to update altitude and speed for selected aircraft
  useEffect(() => {
    if (!selectedAircraftDetail || selectedAircraftDetail.error) return;
    
    const selectedPlane = aircraft.find(plane => 
      selectedAircraftDetail.ICAO && plane.hex.replace('~', '') === selectedAircraftDetail.ICAO
    );
    
    if (selectedPlane) {
      setSelectedAircraftDetail(prev => {
        if (!prev || prev.error) return prev;
        // Only update if values actually changed to avoid unnecessary re-renders
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
  }, [aircraft]); // Only depend on aircraft array changes

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

      <button 
        className="filter-button"
        onClick={() => setShowFilter(!showFilter)}
        aria-label="Filter Planes"
        style={{ 
          position: 'fixed', 
          top: '80px', 
          right: '20px', 
          background: selectedPlaneFilters.size > 0 ? currentColors.primary : 'rgba(0, 255, 0, 0.1)',
          border: `2px solid ${currentColors.primary}`,
          borderRadius: '50%',
          width: '50px',
          height: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1000,
          backdropFilter: 'blur(10px)',
          transition: 'all 0.3s ease'
        }}
      >
        <Filter size={24} color={selectedPlaneFilters.size > 0 ? '#000' : currentColors.primary} />
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

              <div className="settings-section">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={showNonStandardADSB}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setShowNonStandardADSB(newValue);
                      localStorage.setItem('showNonStandardADSB', newValue.toString());
                    }}
                  />
                  <span>Show Non-Standard ADS-B (TIS-B, ADSR, MLAT)</span>
                </label>
              </div>

              <div className="settings-section">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={devMode}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setDevMode(newValue);
                      localStorage.setItem('devMode', newValue.toString());
                    }}
                  />
                  <span>Developer Mode (Show Raw Data Fields)</span>
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

              <div className="settings-section">
                <label>Color Mode</label>
                <div className="color-mode-buttons">
                  <button
                    className={`color-mode-button ${colorMode === 'classic' ? 'active' : ''}`}
                    onClick={() => setColorMode('classic')}
                  >
                    Classic Radar
                  </button>
                  <button
                    className={`color-mode-button ${colorMode === 'pns' ? 'active' : ''}`}
                    onClick={() => setColorMode('pns')}
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
                            // Deselect all from this manufacturer
                            manufacturerPlanes.forEach(p => newFilters.delete(p));
                          } else {
                            // Select all from this manufacturer
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
                            className={`color-mode-button ${isSelected ? 'active' : ''}`}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              padding: '0.5rem',
                              background: isSelected ? currentColors.primary : 'rgba(0, 255, 0, 0.05)',
                              border: `2px solid ${isSelected ? currentColors.primary : 'rgba(0, 255, 0, 0.2)'}`,
                              color: isSelected ? '#000' : currentColors.primary,
                              minHeight: '80px',
                              position: 'relative'
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
        {selectedPlaneFilters.size > 0 && (
          <p style={{ 
            fontSize: '0.85rem', 
            color: currentColors.primary, 
            background: 'rgba(0, 255, 0, 0.1)',
            padding: '0.3rem 0.8rem',
            borderRadius: '20px',
            border: `1px solid ${currentColors.primary}`,
            marginTop: '0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            maxWidth: '90%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            <Filter size={16} /> Filtering: {Array.from(selectedPlaneFilters).join(', ')}
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
                <h2>SCANNING...</h2>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>
                <div>⏱ {countdown}s</div>
                <div>Tracking: {aircraft.length}</div>
              </div>
            </div>
          </>
        ) : selectedAircraftDetail.error ? (
          <div className="detail-item detail-item-1">
            <p>Aircraft <strong>{selectedAircraftDetail.Registration}</strong> {selectedAircraftDetail.error}</p>
          </div>
        ) : (
          <>
            <div className="card-header card-header-enter">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plane size={32} color={currentColors.primary} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 8px ${currentColors.shadow})` }} />
                <h2>AIRCRAFT IDENTIFIED</h2>
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
              {(selectedAircraftDetail.Airline || selectedAircraftDetail.RegisteredOwners) && (
                <div className="detail-item detail-item-2">
                  <Users size={24} color={currentColors.primary} strokeWidth={2} />
                  <p>
                    <strong>{selectedAircraftDetail.Airline ? 'Airline' : 'Owner'}:</strong>{' '}
                    {selectedAircraftDetail.Airline 
                      ? `${selectedAircraftDetail.Airline.name} (${selectedAircraftDetail.Airline.iata})` 
                      : selectedAircraftDetail.RegisteredOwners || ''
                    }
                  </p>
                </div>
              )}
              {selectedAircraftDetail.Registration && (
                <div className="detail-item detail-item-3">
                  <FileText size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Registration:</strong> {selectedAircraftDetail.Registration}</p>
                </div>
              )}
              {selectedAircraftDetail.Model && (
                <div className="detail-item detail-item-4">
                  <Plane size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Model:</strong> {selectedAircraftDetail.Model}</p>
                </div>
              )}
              {devMode && selectedAircraftDetail && (() => {
                const currentAircraft = aircraft.find(ac => ac.hex.replace('~', '') === selectedAircraftDetail.ICAO);
                return currentAircraft && (
                  <>
                    {currentAircraft.t && (
                      <div className="detail-item" style={{ opacity: 0.7, fontSize: '0.85rem' }}>
                        <p><strong>[DEV] Type Code:</strong> {currentAircraft.t}</p>
                      </div>
                    )}
                    {currentAircraft.desc && (
                      <div className="detail-item" style={{ opacity: 0.7, fontSize: '0.85rem' }}>
                        <p><strong>[DEV] Description:</strong> {currentAircraft.desc}</p>
                      </div>
                    )}
                  </>
                );
              })()}
              {selectedAircraftDetail.Manufacturer && (
                <div className="detail-item detail-item-5">
                  <Factory size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Manufacturer:</strong> {selectedAircraftDetail.Manufacturer}</p>
                </div>
              )}
              {selectedAircraftDetail.Callsign && (
                <div className="detail-item detail-item-7">
                  <Navigation size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Callsign:</strong> {selectedAircraftDetail.Callsign}</p>
                </div>
              )}
              {selectedAircraftDetail.Altitude !== undefined && (
                <div className="detail-item detail-item-8">
                  <Mountain size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Altitude:</strong> {selectedAircraftDetail.Altitude === 'ground' ? 'On Ground' : `${Math.round(selectedAircraftDetail.Altitude)} ft`}</p>
                </div>
              )}
              {selectedAircraftDetail.Speed !== undefined && (
                <div className="detail-item detail-item-9">
                  <Gauge size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>Speed:</strong> {selectedAircraftDetail.Speed} km/h</p>
                </div>
              )}
              {selectedAircraftDetail.ICAO && (
                <div className="detail-item detail-item-10">
                  <Radio size={24} color={currentColors.primary} strokeWidth={2} />
                  <p><strong>ICAO:</strong> {selectedAircraftDetail.ICAO}</p>
                </div>
              )}
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
