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

// Get API key from multiple possible sources
const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// Debug logging for API key configuration
console.log('🔑 Google Directions API Key check:');
console.log('   process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:', process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ? 'SET' : 'NOT SET');
console.log('   Constants.expoConfig?.ios?.config?.googleMapsApiKey:', Constants.expoConfig?.ios?.config?.googleMapsApiKey ? 'SET' : 'NOT SET');
console.log('   Final key:', GOOGLE_MAPS_API_KEY ? `${GOOGLE_MAPS_API_KEY.substring(0, 10)}...` : 'NOT FOUND');

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
  console.log(`🔍 [decodePolyline] Starting decode, input length: ${encoded.length}`);

  if (!encoded || typeof encoded !== 'string') {
    console.error(`❌ [decodePolyline] Invalid input: ${typeof encoded}`);
    throw new Error('Invalid polyline input');
  }

  const coordinates: RouteCoordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  let iterations = 0;
  const maxIterations = 100000; // Safety limit

  try {
    while (index < encoded.length) {
      iterations++;
      if (iterations > maxIterations) {
        console.error(`❌ [decodePolyline] Exceeded max iterations at index ${index}`);
        throw new Error('Polyline decode exceeded max iterations');
      }

      let b;
      let shift = 0;
      let result = 0;

      // Decode latitude
      do {
        if (index >= encoded.length) {
          console.error(`❌ [decodePolyline] Index out of bounds at ${index}`);
          throw new Error('Polyline decode: unexpected end of string');
        }
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
        if (index >= encoded.length) {
          console.error(`❌ [decodePolyline] Index out of bounds at ${index}`);
          throw new Error('Polyline decode: unexpected end of string');
        }
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      const decodedLat = lat / 1e5;
      const decodedLng = lng / 1e5;

      // Validate decoded values
      if (isNaN(decodedLat) || isNaN(decodedLng)) {
        console.error(`❌ [decodePolyline] NaN detected at iteration ${iterations}: lat=${decodedLat}, lng=${decodedLng}`);
        throw new Error('Polyline decode produced NaN coordinates');
      }

      coordinates.push({
        latitude: decodedLat,
        longitude: decodedLng,
      });
    }

    console.log(`✅ [decodePolyline] Successfully decoded ${coordinates.length} coordinates in ${iterations} iterations`);
    return coordinates;
  } catch (error) {
    console.error(`❌ [decodePolyline] Error during decode at index ${index}, iteration ${iterations}:`, error);
    throw error;
  }
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
  mode: TravelMode = 'driving',
  signal?: AbortSignal
): Promise<DirectionsResult | null> {
  // Check if already cancelled
  if (signal?.aborted) {
    console.log('🚫 [fetchDirections] Already cancelled before starting');
    throw new DOMException('Operation cancelled', 'AbortError');
  }

  // Check cache first
  const cacheKey = getCacheKey(origin, destination, mode);
  console.log(`🔍 [fetchDirections] Checking cache for key: ${cacheKey.substring(0, 60)}...`);
  console.log(`🔍 [fetchDirections] Cache size: ${directionsCache.size} entries`);
  const cached = directionsCache.get(cacheKey);
  if (cached) {
    console.log(`✅ [fetchDirections] Cache HIT! Returning ${cached.coordinates.length} cached coordinates`);
    return cached;
  }
  console.log(`❌ [fetchDirections] Cache MISS - will fetch from API`);

  if (!GOOGLE_MAPS_API_KEY) {
    console.error('❌ Google Maps API key not configured - cannot fetch directions');
    return null;
  }

  const originStr = `${origin.latitude},${origin.longitude}`;
  const destinationStr = `${destination.latitude},${destination.longitude}`;

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}`;

  console.log(`🔍 [fetchDirections] 🌐 Fetching ${mode} directions: ${originStr} -> ${destinationStr}`);
  console.log(`🔍 [fetchDirections] URL: ${url.substring(0, 100)}...`);

  // Create combined AbortController with timeout and external signal
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`❌ [fetchDirections] Fetch timeout after 10s - aborting`);
    controller.abort();
  }, 10000); // 10 second timeout

  // Listen to external abort signal
  if (signal) {
    signal.addEventListener('abort', () => {
      console.log('🚫 [fetchDirections] External cancellation signal received');
      controller.abort();
    });
  }

  try {
    console.log(`🔍 [fetchDirections] Calling fetch with abort controller...`);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId); // Clear timeout on success
    console.log(`🔍 [fetchDirections] Fetch completed, status: ${response.status}`);

    if (!response.ok) {
      console.error(`❌ [fetchDirections] HTTP error: ${response.status} ${response.statusText}`);
      return null;
    }

    console.log(`🔍 [fetchDirections] Parsing JSON...`);
    let data: DirectionsResponse;
    try {
      data = await response.json();
      console.log(`🔍 [fetchDirections] JSON parsed successfully`);
    } catch (jsonError) {
      console.error(`❌ [fetchDirections] JSON parse error:`, jsonError);
      console.error(`❌ [fetchDirections] Response text:`, await response.text().catch(() => 'Could not read text'));
      return null;
    }

    console.log(`🔍 [fetchDirections] API response status: ${data.status}`);

    if (data.status !== 'OK') {
      console.warn(`⚠️ [fetchDirections] Directions API error: ${data.status}`, data.error_message);
      return null;
    }

    if (!data.routes || data.routes.length === 0) {
      console.warn('⚠️ [fetchDirections] No routes found in response');
      return null;
    }

    const route = data.routes[0];
    console.log(`🔍 [fetchDirections] Route found, has ${route.legs?.length || 0} legs`);

    if (!route.overview_polyline || !route.overview_polyline.points) {
      console.error(`❌ [fetchDirections] No polyline in route response`);
      return null;
    }

    const polyline = route.overview_polyline.points;
    console.log(`🔍 [fetchDirections] Polyline length: ${polyline.length} chars`);
    console.log(`🔍 [fetchDirections] Decoding polyline...`);

    let coordinates: RouteCoordinate[];
    try {
      coordinates = decodePolyline(polyline);
      console.log(`🔍 [fetchDirections] Decoded ${coordinates.length} coordinates`);
    } catch (decodeError) {
      console.error(`❌ [fetchDirections] Polyline decode error:`, decodeError);
      console.error(`❌ [fetchDirections] Polyline sample:`, polyline.substring(0, 100));
      return null;
    }

    // Validate decoded coordinates
    const invalidCoords = coordinates.filter(c =>
      typeof c.latitude !== 'number' ||
      typeof c.longitude !== 'number' ||
      isNaN(c.latitude) ||
      isNaN(c.longitude) ||
      c.latitude === 0 ||
      c.longitude === 0
    );

    if (invalidCoords.length > 0) {
      console.error(`❌ [fetchDirections] ${invalidCoords.length} invalid coordinates after decoding!`);
      console.error(`❌ [fetchDirections] First invalid:`, invalidCoords[0]);
      return null;
    }

    // Extract distance and duration from first leg
    const leg = route.legs[0];
    console.log(`🔍 [fetchDirections] Leg distance: ${leg?.distance?.text}, duration: ${leg?.duration?.text}`);

    const result: DirectionsResult = {
      coordinates,
      distance: leg?.distance?.value,
      duration: leg?.duration?.value,
    };

    // Cache the result
    directionsCache.set(cacheKey, result);
    console.log(`✅ [fetchDirections] Successfully fetched and cached directions`);

    return result;
  } catch (error) {
    clearTimeout(timeoutId); // Clear timeout on error
    console.error('❌ [fetchDirections] Caught error:');
    console.error('❌ [fetchDirections] Error type:', error?.constructor?.name || typeof error);
    console.error('❌ [fetchDirections] Error message:', error instanceof Error ? error.message : String(error));
    console.error('❌ [fetchDirections] Error stack:', error instanceof Error ? error.stack : 'No stack');

    // Handle abort error specifically
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('❌ [fetchDirections] Request was aborted due to timeout');
    }

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
  modes: TravelMode[],
  signal?: AbortSignal
): Promise<RouteSegment[]> {
  console.log('🔍 [GoogleDirections] START fetchCompleteRouteWithSegments');
  console.log(`🔍 [GoogleDirections] Stops: ${stops.length}, Modes: ${modes.length}`);

  // Check if already cancelled
  if (signal?.aborted) {
    console.log('🚫 [GoogleDirections] Already cancelled before starting');
    throw new DOMException('Operation cancelled', 'AbortError');
  }

  // Log all input coordinates
  for (let i = 0; i < stops.length; i++) {
    console.log(`🔍 [GoogleDirections] Stop ${i + 1}: lat=${stops[i].latitude}, lon=${stops[i].longitude}`);
  }
  console.log('🔍 [GoogleDirections] Modes:', modes);

  if (stops.length < 2) {
    console.log('🔍 [GoogleDirections] Less than 2 stops, returning empty');
    return [];
  }

  // Validate coordinates
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (!stop.latitude || !stop.longitude || isNaN(stop.latitude) || isNaN(stop.longitude) ||
        stop.latitude === 0 || stop.longitude === 0) {
      console.error(`❌ [GoogleDirections] Stop ${i + 1} has invalid coordinates: (${stop.latitude}, ${stop.longitude})`);
      throw new Error(`Stop ${i + 1} has invalid coordinates: (${stop.latitude}, ${stop.longitude})`);
    }
  }

  if (modes.length !== stops.length - 1) {
    const errorMsg = `Modes array length mismatch: expected ${stops.length - 1} (stops.length - 1), got ${modes.length}`;
    console.error('❌ [GoogleDirections]', errorMsg);
    console.error(`   Stops: ${stops.length}, Modes: ${modes.length}`);
    throw new Error(errorMsg);
  }

  console.log('✅ [GoogleDirections] All validations passed, fetching directions...');
  const segments: RouteSegment[] = [];

  // Fetch directions for each consecutive stop pair
  let lastFetchTime = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    // Check if cancelled before each segment
    if (signal?.aborted) {
      console.log('🚫 [GoogleDirections] Optimization cancelled during segment fetch');
      throw new DOMException('Operation cancelled', 'AbortError');
    }

    const origin = stops[i];
    const destination = stops[i + 1];
    const mode = modes[i];

    console.log(`   Segment ${i + 1}/${stops.length - 1}: ${mode} from (${origin.latitude.toFixed(4)}, ${origin.longitude.toFixed(4)}) to (${destination.latitude.toFixed(4)}, ${destination.longitude.toFixed(4)})`);

    // Check if this request will hit cache
    const cacheKey = getCacheKey(origin, destination, mode);
    const willHitCache = directionsCache.has(cacheKey);
    console.log(`   📦 Cache status: ${willHitCache ? 'HIT (no delay needed)' : 'MISS (will fetch)'}`);

    // Add delay between API calls ONLY if we'll actually fetch (not cached)
    // This prevents rate limiting while allowing cached requests to proceed immediately
    if (!willHitCache && i > 0) {
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      if (timeSinceLastFetch < 500) {
        const delayNeeded = 500 - timeSinceLastFetch;
        console.log(`   ⏱️ Waiting ${delayNeeded}ms before next API call to prevent rate limiting...`);
        await new Promise(resolve => setTimeout(resolve, delayNeeded));
        console.log(`   ✅ Delay completed`);
      }
    }

    console.log(`   🔍 Calling fetchDirections for segment ${i + 1}...`);
    const result = await fetchDirections(origin, destination, mode, signal);
    console.log(`   🔍 fetchDirections returned for segment ${i + 1}`);

    // Track when we last fetched (not cached)
    if (!willHitCache) {
      lastFetchTime = Date.now();
    }

    if (result && result.coordinates.length > 0) {
      console.log(`   ✅ Segment ${i + 1}: ${result.coordinates.length} coordinates`);

      // Validate returned coordinates
      const invalidCoords = result.coordinates.filter(c =>
        !c.latitude || !c.longitude || isNaN(c.latitude) || isNaN(c.longitude) ||
        c.latitude === 0 || c.longitude === 0
      );

      if (invalidCoords.length > 0) {
        console.error(`❌ [GoogleDirections] Segment ${i + 1} has ${invalidCoords.length} invalid coordinates from API!`);
        console.error('❌ [GoogleDirections] Invalid coords:', invalidCoords);
        throw new Error(`Segment ${i + 1} contains invalid coordinates from Google Directions API`);
      }

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
      console.warn(`   ⚠️ Falling back to straight line for segment ${i} to ${i + 1}`);
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

  console.log(`🔍 [GoogleDirections] Completed successfully with ${segments.length} segments`);
  console.log('🔍 [GoogleDirections] END fetchCompleteRouteWithSegments');
  return segments;
}

/**
 * Clear the directions cache
 * Useful when route changes or for memory management
 */
export function clearDirectionsCache(): void {
  directionsCache.clear();
}
