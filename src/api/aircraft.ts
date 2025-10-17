// ===== AIRCRAFT API =====
// Centralized API functions for fetching aircraft data

export interface Aircraft {
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

export interface AircraftDetail {
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

export interface HexDbResponse {
  Registration?: string;
  Type?: string;
  ICAOTypeCode?: string;
  RegisteredOwners?: string;
}

export interface AdsbDbRoute {
  callsign: string;
  origin: {
    iata_code: string;
    name: string;
    municipality: string;
    country_name: string;
  };
  destination: {
    iata_code: string;
    name: string;
    municipality: string;
    country_name: string;
  };
}

/**
 * Fetch aircraft within a radius from a location
 * @param lat - Latitude
 * @param lon - Longitude
 * @param distance - Distance in nautical miles
 * @param source - Data source ('adsb.fi' or 'airplanes.live')
 */
export async function fetchAircraftInRadius(
  lat: number,
  lon: number,
  distance: number,
  source: 'adsb.fi' | 'airplanes.live' = 'adsb.fi'
): Promise<Aircraft[]> {
  try {
    const url = `/api/lat/${lat}/lon/${lon}/dist/${distance}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      if (res.status === 429) {
        console.warn('Rate limited');
        return [];
      }
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    return data.aircraft || [];
  } catch (err) {
    console.error('Error fetching aircraft:', err);
    return [];
  }
}

/**
 * Fetch detailed aircraft information from hexdb.io
 * @param hex - Aircraft ICAO hex code
 */
export async function fetchAircraftDetailsFromHexDb(hex: string): Promise<Partial<AircraftDetail>> {
  try {
    const res = await fetch(`https://hexdb.io/hex-image?hex=${hex}&json`);
    if (res.ok) {
      const data: HexDbResponse = await res.json();
      return {
        Registration: data.Registration || 'Unknown',
        Type: data.Type || data.ICAOTypeCode || 'Unknown',
        Manufacturer: 'Unknown',
        RegisteredOwners: data.RegisteredOwners || 'Unknown'
      };
    }
  } catch (err) {
    console.warn('hexdb.io failed, trying CORS proxy');
    try {
      const res = await fetch(`https://corsproxy.io/?https://hexdb.io/hex-image?hex=${hex}&json`);
      if (res.ok) {
        const data: HexDbResponse = await res.json();
        return {
          Registration: data.Registration || 'Unknown',
          Type: data.Type || data.ICAOTypeCode || 'Unknown',
          Manufacturer: 'Unknown',
          RegisteredOwners: data.RegisteredOwners || 'Unknown'
        };
      }
    } catch (proxyErr) {
      console.error('CORS proxy also failed:', proxyErr);
    }
  }
  
  return {
    Registration: 'Unknown',
    Type: 'Unknown',
    Manufacturer: 'Unknown',
    RegisteredOwners: 'Unknown'
  };
}

/**
 * Fetch flight route information from adsbdb.com
 * @param hex - Aircraft ICAO hex code
 */
export async function fetchFlightRoute(hex: string): Promise<{ Origin?: any; Destination?: any; Airline?: any }> {
  try {
    const res = await fetch(`https://api.adsbdb.com/v0/aircraft/${hex}`);
    if (res.ok) {
      const data = await res.json();
      const route: AdsbDbRoute | undefined = data.flightroute;
      
      if (route) {
        return {
          Origin: {
            name: route.origin.name,
            iata_code: route.origin.iata_code,
            municipality: route.origin.municipality,
            country_name: route.origin.country_name
          },
          Destination: {
            name: route.destination.name,
            iata_code: route.destination.iata_code,
            municipality: route.destination.municipality,
            country_name: route.destination.country_name
          },
          Airline: data.airline ? {
            name: data.airline.name,
            iata: data.airline.iata,
            country: data.airline.country
          } : undefined
        };
      }
    }
  } catch (err) {
    console.error('Error fetching route from adsbdb:', err);
  }
  
  return {};
}

/**
 * Geocode airport IATA code to coordinates using Nominatim
 * @param iataCode - Airport IATA code
 * @param airportName - Airport name for fallback search
 */
export async function geocodeAirport(iataCode: string, airportName?: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const query = `${iataCode} airport ${airportName || ''}`.trim();
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
    );
    
    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon)
        };
      }
    }
  } catch (err) {
    console.error('Error geocoding airport:', err);
  }
  
  return null;
}

/**
 * Fetch complete aircraft details including route and geocoded airports
 * @param hex - Aircraft ICAO hex code
 */
export async function fetchCompleteAircraftDetails(hex: string): Promise<AircraftDetail> {
  const cleanHex = hex.replace('~', '');
  
  // Fetch basic details and route in parallel
  const [basicDetails, routeData] = await Promise.all([
    fetchAircraftDetailsFromHexDb(cleanHex),
    fetchFlightRoute(cleanHex)
  ]);
  
  const aircraftDetail: AircraftDetail = {
    ICAO: cleanHex,
    Registration: basicDetails.Registration || 'Unknown',
    Manufacturer: basicDetails.Manufacturer || 'Unknown',
    Type: basicDetails.Type || 'Unknown',
    RegisteredOwners: basicDetails.RegisteredOwners || 'Unknown',
    ...routeData
  };
  
  // Geocode airports if we have route data
  if (aircraftDetail.Origin && aircraftDetail.Destination) {
    const [originCoords, destCoords] = await Promise.all([
      geocodeAirport(aircraftDetail.Origin.iata_code, aircraftDetail.Origin.name),
      geocodeAirport(aircraftDetail.Destination.iata_code, aircraftDetail.Destination.name)
    ]);
    
    if (originCoords) {
      aircraftDetail.Origin.lat = originCoords.lat;
      aircraftDetail.Origin.lon = originCoords.lon;
    }
    
    if (destCoords) {
      aircraftDetail.Destination.lat = destCoords.lat;
      aircraftDetail.Destination.lon = destCoords.lon;
    }
  }
  
  return aircraftDetail;
}

/**
 * Search for a location using Nominatim
 * @param query - Search query (city, airport, address, etc.)
 */
export async function searchLocation(query: string): Promise<{ lat: number; lon: number; display_name: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
    );
    
    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
          display_name: data[0].display_name
        };
      }
    }
  } catch (err) {
    console.error('Error searching location:', err);
  }
  
  return null;
}
