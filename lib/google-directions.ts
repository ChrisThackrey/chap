import Constants from 'expo-constants';
import type { RouteCoordinate, TravelMode, RouteSegment } from '@/types/route';
import { isValidCoordinateObject } from './coordinate-validation';
import { GOOGLE_APP_IDENTITY_HEADERS } from './google-places';
import { logger } from './logger';

// Re-export for backward compatibility
export type { RouteCoordinate } from '@/types/route';

/**
 * Google Directions API Service
 *
 * Fetches road-following routes between stops using Google Directions API.
 * Returns decoded polyline coordinates for drawing routes on the map.
 */

// Get API key from the env var first, falling back to the native map SDK key in app config.
const GOOGLE_MAPS_API_KEY: string | undefined =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey;

if (!GOOGLE_MAPS_API_KEY) {
  logger.warn('[GoogleDirections] No Google Maps API key configured; routes will fall back to straight lines.');
}

/** Per-request timeout; generous for mobile networks. */
const FETCH_TIMEOUT_MS = 15_000;
/** Minimum spacing between uncached Directions API calls to avoid rate limiting. */
const MIN_FETCH_INTERVAL_MS = 500;

interface DirectionsResponse {
  routes: {
    overview_polyline: {
      points: string;
    };
    legs: {
      distance: { text: string; value: number };
      duration: { text: string; value: number };
    }[];
  }[];
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

  if (!encoded || typeof encoded !== 'string') {
    logger.error(`❌ [decodePolyline] Invalid input: ${typeof encoded}`);
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
        logger.error(`❌ [decodePolyline] Exceeded max iterations at index ${index}`);
        throw new Error('Polyline decode exceeded max iterations');
      }

      let b;
      let shift = 0;
      let result = 0;

      // Decode latitude
      do {
        if (index >= encoded.length) {
          logger.error(`❌ [decodePolyline] Index out of bounds at ${index}`);
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
          logger.error(`❌ [decodePolyline] Index out of bounds at ${index}`);
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
        logger.error(`❌ [decodePolyline] NaN detected at iteration ${iterations}: lat=${decodedLat}, lng=${decodedLng}`);
        throw new Error('Polyline decode produced NaN coordinates');
      }

      coordinates.push({
        latitude: decodedLat,
        longitude: decodedLng,
      });
    }
    return coordinates;
  } catch (error) {
    logger.error(`❌ [decodePolyline] Error during decode at index ${index}, iteration ${iterations}:`, error);
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
    logger.debug('🚫 [fetchDirections] Already cancelled before starting');
    throw new DOMException('Operation cancelled', 'AbortError');
  }

  // Check cache first
  const cacheKey = getCacheKey(origin, destination, mode);
  const cached = directionsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (!GOOGLE_MAPS_API_KEY) {
    logger.error('❌ Google Maps API key not configured - cannot fetch directions');
    return null;
  }

  const originStr = `${origin.latitude},${origin.longitude}`;
  const destinationStr = `${destination.latitude},${destination.longitude}`;

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}`;

  logger.debug(`🔍 [fetchDirections] 🌐 Fetching ${mode} directions: ${originStr} -> ${destinationStr}`);

  // Create combined AbortController with timeout and external signal
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.error(`❌ [fetchDirections] Fetch timeout after 15s - aborting`);
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  // Listen to external abort signal with cleanup
  const onExternalAbort = () => {
    logger.debug('🚫 [fetchDirections] External cancellation signal received');
    controller.abort();
  };
  if (signal) {
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {

    const response = await fetch(url, { signal: controller.signal, headers: GOOGLE_APP_IDENTITY_HEADERS });

    clearTimeout(timeoutId); // Clear timeout on success
    if (signal) signal.removeEventListener('abort', onExternalAbort);

    if (!response.ok) {
      logger.error(`❌ [fetchDirections] HTTP error: ${response.status} ${response.statusText}`);
      return null;
    }
    let data: DirectionsResponse;
    try {
      data = await response.json();
    } catch (jsonError) {
      logger.error(`❌ [fetchDirections] JSON parse error:`, jsonError);
      logger.error(`❌ [fetchDirections] Response text:`, await response.text().catch(() => 'Could not read text'));
      return null;
    }

    if (data.status !== 'OK') {
      logger.warn(`⚠️ [fetchDirections] Directions API error: ${data.status}`, data.error_message);
      return null;
    }

    if (!data.routes || data.routes.length === 0) {
      logger.warn('⚠️ [fetchDirections] No routes found in response');
      return null;
    }

    const route = data.routes[0];

    if (!route.overview_polyline || !route.overview_polyline.points) {
      logger.error(`❌ [fetchDirections] No polyline in route response`);
      return null;
    }

    const polyline = route.overview_polyline.points;

    let coordinates: RouteCoordinate[];
    try {
      coordinates = decodePolyline(polyline);
    } catch (decodeError) {
      logger.error(`❌ [fetchDirections] Polyline decode error:`, decodeError);
      logger.error(`❌ [fetchDirections] Polyline sample:`, polyline.substring(0, 100));
      return null;
    }

    // Validate decoded coordinates
    const invalidCoords = coordinates.filter((c) => !isValidCoordinateObject(c));

    if (invalidCoords.length > 0) {
      logger.error(`❌ [fetchDirections] ${invalidCoords.length} invalid coordinates after decoding!`);
      logger.error(`❌ [fetchDirections] First invalid:`, invalidCoords[0]);
      return null;
    }

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
    clearTimeout(timeoutId); // Clear timeout on error
    if (signal) signal.removeEventListener('abort', onExternalAbort);

    if (error instanceof Error && error.name === 'AbortError') {
      // Caller cancelled (e.g. the route changed while fetching): propagate so
      // the whole multi-segment fetch stops instead of drawing a stale route.
      if (signal?.aborted) {
        throw new DOMException('Operation cancelled', 'AbortError');
      }
      // Otherwise our own timeout fired; fall back to a straight line for this segment.
      logger.warn(`[fetchDirections] Timed out after ${FETCH_TIMEOUT_MS}ms; using straight-line fallback`);
      return null;
    }

    logger.warn('[fetchDirections] Request failed:', error instanceof Error ? error.message : String(error));
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
      logger.warn(`Falling back to straight line for segment ${i} to ${i + 1}`);
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

  // Check if already cancelled
  if (signal?.aborted) {
    logger.debug('🚫 [GoogleDirections] Already cancelled before starting');
    throw new DOMException('Operation cancelled', 'AbortError');
  }

  if (stops.length < 2) {
    return [];
  }

  // Validate coordinates
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (!isValidCoordinateObject(stop)) {
      logger.error(`❌ [GoogleDirections] Stop ${i + 1} has invalid coordinates: (${stop.latitude}, ${stop.longitude})`);
      throw new Error(`Stop ${i + 1} has invalid coordinates: (${stop.latitude}, ${stop.longitude})`);
    }
  }

  if (modes.length !== stops.length - 1) {
    const errorMsg = `Modes array length mismatch: expected ${stops.length - 1} (stops.length - 1), got ${modes.length}`;
    logger.error('❌ [GoogleDirections]', errorMsg);
    logger.error(`   Stops: ${stops.length}, Modes: ${modes.length}`);
    throw new Error(errorMsg);
  }
  const segments: RouteSegment[] = [];

  // Fetch directions for each consecutive stop pair
  let lastFetchTime = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    // Check if cancelled before each segment
    if (signal?.aborted) {
      logger.debug('🚫 [GoogleDirections] Optimization cancelled during segment fetch');
      throw new DOMException('Operation cancelled', 'AbortError');
    }

    const origin = stops[i];
    const destination = stops[i + 1];
    const mode = modes[i];

    // Check if this request will hit cache
    const cacheKey = getCacheKey(origin, destination, mode);
    const willHitCache = directionsCache.has(cacheKey);

    // Add delay between API calls ONLY if we'll actually fetch (not cached)
    // This prevents rate limiting while allowing cached requests to proceed immediately
    if (!willHitCache && i > 0) {
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      if (timeSinceLastFetch < MIN_FETCH_INTERVAL_MS) {
        const delayNeeded = MIN_FETCH_INTERVAL_MS - timeSinceLastFetch;
        await new Promise(resolve => setTimeout(resolve, delayNeeded));
      }
    }

    let result: DirectionsResult | null = null;
    try {
      result = await fetchDirections(origin, destination, mode, signal);
    } catch (segmentError) {
      // Re-throw AbortErrors — entire operation must stop
      if (segmentError instanceof Error && segmentError.name === 'AbortError') {
        throw segmentError;
      }
      logger.error(`❌ [GoogleDirections] Segment ${i + 1} failed:`, segmentError);
      // Continue with fallback straight line for this segment
      result = null;
    }

    // Track when we last fetched (not cached)
    if (!willHitCache) {
      lastFetchTime = Date.now();
    }

    if (result && result.coordinates.length > 0) {

      // Validate returned coordinates
      const invalidCoords = result.coordinates.filter((c) => !isValidCoordinateObject(c));

      if (invalidCoords.length > 0) {
        logger.error(`❌ [GoogleDirections] Segment ${i + 1} has ${invalidCoords.length} invalid coordinates from API!`);
        logger.error('❌ [GoogleDirections] Invalid coords:', invalidCoords);
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
      logger.warn(`   ⚠️ Falling back to straight line for segment ${i} to ${i + 1}`);
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
