import Constants from 'expo-constants';
import type { RouteCoordinate, TravelMode, RouteSegment } from '@/types/route';

// Re-export for backward compatibility
export type { RouteCoordinate } from '@/types/route';

/**
 * Google Directions API Service
 *
 * Fetches road-following routes between stops using Google Directions API.
 * Returns decoded polyline coordinates for drawing routes on the map.
 */

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

interface DirectionsResponse {
  routes: Array<{
    overview_polyline: {
      points: string;
    };
    legs: Array<{
      distance: { text: string; value: number };
      duration: { text: string; value: number };
    }>;
  }>;
  status: string;
  error_message?: string;
}

export interface DirectionsResult {
  coordinates: RouteCoordinate[];
  distance?: number; // in meters
  duration?: number; // in seconds
}

// Cache for API responses to minimize API calls
const directionsCache = new Map<string, DirectionsResult>();

/**
 * Decode Google Directions API polyline to array of coordinates
 * Uses the Encoded Polyline Algorithm Format
 * @see https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodePolyline(encoded: string): RouteCoordinate[] {
  const coordinates: RouteCoordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    // Decode latitude
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;

    // Decode longitude
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coordinates.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return coordinates;
}

/**
 * Generate cache key for directions request
 */
function getCacheKey(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  mode: TravelMode = 'driving'
): string {
  return `${mode}:${origin.latitude.toFixed(6)},${origin.longitude.toFixed(6)}->${destination.latitude.toFixed(6)},${destination.longitude.toFixed(6)}`;
}

/**
 * Fetch directions between two points from Google Directions API
 *
 * @param origin Starting coordinate
 * @param destination Ending coordinate
 * @param mode Travel mode: 'driving' or 'walking'
 * @returns DirectionsResult with decoded coordinates, or null if failed
 */
export async function fetchDirections(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  mode: TravelMode = 'driving'
): Promise<DirectionsResult | null> {
  // Check cache first
  const cacheKey = getCacheKey(origin, destination, mode);
  const cached = directionsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (!GOOGLE_MAPS_API_KEY) {
    console.error('Google Maps API key not configured');
    return null;
  }

  const originStr = `${origin.latitude},${origin.longitude}`;
  const destinationStr = `${destination.latitude},${destination.longitude}`;

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(url);
    const data: DirectionsResponse = await response.json();

    if (data.status !== 'OK') {
      console.warn(`Directions API error: ${data.status}`, data.error_message);
      return null;
    }

    if (!data.routes || data.routes.length === 0) {
      console.warn('No routes found');
      return null;
    }

    const route = data.routes[0];
    const polyline = route.overview_polyline.points;
    const coordinates = decodePolyline(polyline);

    // Extract distance and duration from first leg
    const leg = route.legs[0];
    const result: DirectionsResult = {
      coordinates,
      distance: leg?.distance?.value,
      duration: leg?.duration?.value,
    };

    // Cache the result
    directionsCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error('Error fetching directions:', error);
    return null;
  }
}

/**
 * Fetch complete route with road-following paths between all consecutive stops
 *
 * @param stops Array of stop coordinates in order
 * @returns Array of all coordinates for the complete route, or empty array if all requests fail
 */
export async function fetchCompleteRoute(
  stops: RouteCoordinate[]
): Promise<RouteCoordinate[]> {
  if (stops.length < 2) {
    return stops;
  }

  const allCoordinates: RouteCoordinate[] = [];

  // Fetch directions for each consecutive stop pair
  for (let i = 0; i < stops.length - 1; i++) {
    const origin = stops[i];
    const destination = stops[i + 1];

    const result = await fetchDirections(origin, destination);

    if (result && result.coordinates.length > 0) {
      // Add coordinates, avoiding duplicates at segment boundaries
      if (i === 0) {
        allCoordinates.push(...result.coordinates);
      } else {
        // Skip first coordinate as it's the same as the last coordinate of previous segment
        allCoordinates.push(...result.coordinates.slice(1));
      }
    } else {
      // Fallback: if API fails, add straight line between stops
      console.warn(`Falling back to straight line for segment ${i} to ${i + 1}`);
      if (i === 0 || allCoordinates.length === 0) {
        allCoordinates.push(origin);
      }
      allCoordinates.push(destination);
    }
  }

  return allCoordinates;
}

/**
 * Fetch complete route with segments preserving metadata
 * Unlike fetchCompleteRoute, this returns individual segments with their travel modes
 *
 * @param stops Array of stop coordinates in order
 * @param modes Array of travel modes for each segment (parallel to stops array)
 * @returns Array of RouteSegment objects with coordinates and metadata
 */
export async function fetchCompleteRouteWithSegments(
  stops: RouteCoordinate[],
  modes: TravelMode[]
): Promise<RouteSegment[]> {
  if (stops.length < 2) {
    return [];
  }

  if (modes.length !== stops.length - 1) {
    console.error('Modes array length must be stops.length - 1');
    return [];
  }

  const segments: RouteSegment[] = [];

  // Fetch directions for each consecutive stop pair
  for (let i = 0; i < stops.length - 1; i++) {
    const origin = stops[i];
    const destination = stops[i + 1];
    const mode = modes[i];

    const result = await fetchDirections(origin, destination, mode);

    if (result && result.coordinates.length > 0) {
      segments.push({
        id: `segment-${i}`,
        startStop: i + 1, // 1-indexed
        endStop: i + 2,
        mode,
        coordinates: result.coordinates,
        distance: result.distance || 0,
        duration: result.duration || 0,
      });
    } else {
      // Fallback: if API fails, add straight line between stops
      console.warn(`Falling back to straight line for segment ${i} to ${i + 1}`);
      segments.push({
        id: `segment-${i}`,
        startStop: i + 1,
        endStop: i + 2,
        mode,
        coordinates: [origin, destination],
        distance: 0,
        duration: 0,
      });
    }
  }

  return segments;
}

/**
 * Clear the directions cache
 * Useful when route changes or for memory management
 */
export function clearDirectionsCache(): void {
  directionsCache.clear();
}
