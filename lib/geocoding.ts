import { RouteStop } from '@/types/route';
import { GeocodingResult } from '@/types/validation';
import { scoreGeocodingResult, validateCoordinatesInRegion } from './geocoding-scorer';

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  importance?: number;
  boundingbox?: string[];
  osm_type?: string;
  class?: string;
}

/**
 * Geocode an address to coordinates using Nominatim (OpenStreetMap)
 * Free service, no API key required
 * Rate limit: 1 request/second
 */
export async function geocodeAddress(
  address: string
): Promise<{ latitude: number; longitude: number }> {
  const result = await geocodeAddressWithScore(address);
  return {
    latitude: result.lat,
    longitude: result.lon,
  };
}

/**
 * Geocode an address with confidence scoring
 * Returns full GeocodingResult with quality assessment
 */
export async function geocodeAddressWithScore(
  address: string
): Promise<GeocodingResult> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    address
  )}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ChapDatingApp/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim API error: ${response.statusText}`);
  }

  const data: NominatimResponse[] = await response.json();

  if (!data || data.length === 0) {
    throw new Error(`Could not geocode address: ${address}`);
  }

  // Score the best result
  return scoreGeocodingResult(data[0], address);
}

/**
 * Geocode multiple stops with addresses
 * Includes 1-second delay between requests to respect rate limits
 */
export async function geocodeStops(stops: Partial<RouteStop>[]): Promise<RouteStop[]> {
  const results: RouteStop[] = [];

  for (const stop of stops) {
    try {
      const coords = await geocodeAddress(stop.address!);

      results.push({
        ...stop,
        latitude: coords.latitude,
        longitude: coords.longitude,
      } as RouteStop);

      // Add delay to respect Nominatim rate limit (1 request/second)
      if (stops.indexOf(stop) < stops.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Failed to geocode ${stop.name}:`, error);
      // Use a default coordinate if geocoding fails (San Francisco as fallback)
      results.push({
        ...stop,
        latitude: 37.7749,
        longitude: -122.4194,
      } as RouteStop);
    }
  }

  return results;
}
