/**
 * Geographic calculation utilities for distance and coordinate operations
 */

const EARTH_RADIUS_KM = 6371;
const METERS_PER_MILE = 1609.344;

/**
 * Convert miles to meters
 */
export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE;
}

/**
 * Convert meters to miles
 */
export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Calculate a point at a given distance and bearing from a starting point
 * Uses the Haversine formula for accurate spherical calculations
 *
 * @param lat - Starting latitude in degrees
 * @param lon - Starting longitude in degrees
 * @param distanceKm - Distance in kilometers
 * @param bearingDeg - Bearing in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 * @returns Object with lat and lon of the destination point
 */
export function getPointAtBearing(
  lat: number,
  lon: number,
  distanceKm: number,
  bearingDeg: number
): { lat: number; lon: number } {
  const latRad = toRadians(lat);
  const lonRad = toRadians(lon);
  const bearingRad = toRadians(bearingDeg);
  const angularDistance = distanceKm / EARTH_RADIUS_KM;

  const destLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const destLonRad =
    lonRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLatRad)
    );

  return {
    lat: toDegrees(destLatRad),
    lon: toDegrees(destLonRad),
  };
}

/**
 * Calculate the distance in miles between two coordinate points
 * Uses the Haversine formula for accurate spherical distance
 *
 * @param lat1 - Latitude of first point in degrees
 * @param lon1 - Longitude of first point in degrees
 * @param lat2 - Latitude of second point in degrees
 * @param lon2 - Longitude of second point in degrees
 * @returns Distance in miles
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const deltaLatRad = toRadians(lat2 - lat1);
  const deltaLonRad = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanceKm = EARTH_RADIUS_KM * c;
  return metersToMiles(distanceKm * 1000);
}

/**
 * Calculate the appropriate map delta to display a circle of given radius
 * Returns latitude and longitude deltas for MapView region
 *
 * @param radiusMiles - Radius in miles
 * @param latitude - Center latitude (affects longitude delta calculation)
 * @returns Object with latitudeDelta and longitudeDelta
 */
export function radiusToMapDeltas(
  radiusMiles: number,
  latitude: number,
  paddingMultiplier: number = 3.5
): { latitudeDelta: number; longitudeDelta: number } {
  // Convert miles to degrees (approximate)
  // 1 degree of latitude is approximately 69 miles
  const latDelta = (radiusMiles / 69) * paddingMultiplier;

  // Longitude degrees vary with latitude
  const lonDegreesPerMile = 69 * Math.cos(toRadians(latitude));
  const lonDelta = (radiusMiles / lonDegreesPerMile) * paddingMultiplier;

  return {
    latitudeDelta: Math.max(latDelta, 0.02),
    longitudeDelta: Math.max(lonDelta, 0.02),
  };
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Find the optimal insertion position for a new stop in an existing route
 * Uses minimum insertion distance heuristic to minimize added travel distance
 *
 * For a route A → B → C, when adding stop X:
 * - Position 0 (before A): Cost = distance(X, A)
 * - Position 1 (between A and B): Cost = distance(A, X) + distance(X, B) - distance(A, B)
 * - Position 2 (between B and C): Cost = distance(B, X) + distance(X, C) - distance(B, C)
 * - Position 3 (after C): Cost = distance(C, X)
 *
 * @param existingStops - Array of existing stops sorted by order
 * @param newStop - The new stop's coordinates
 * @returns The optimal order number (1-based) for the new stop
 */
export function findOptimalInsertionPosition(
  existingStops: Coordinate[],
  newStop: Coordinate
): number {
  if (existingStops.length === 0) {
    return 1;
  }

  if (existingStops.length === 1) {
    // With one stop, just add at the end
    return 2;
  }

  let minCost = Infinity;
  let bestPosition = 0;

  // Try position 0 (before first stop)
  const costAtStart = calculateDistanceMiles(
    newStop.latitude,
    newStop.longitude,
    existingStops[0].latitude,
    existingStops[0].longitude
  );

  if (costAtStart < minCost) {
    minCost = costAtStart;
    bestPosition = 0;
  }

  // Try each position between existing stops
  for (let i = 0; i < existingStops.length - 1; i++) {
    const stopA = existingStops[i];
    const stopB = existingStops[i + 1];

    // Current distance A to B
    const distAB = calculateDistanceMiles(
      stopA.latitude,
      stopA.longitude,
      stopB.latitude,
      stopB.longitude
    );

    // Distance A to X
    const distAX = calculateDistanceMiles(
      stopA.latitude,
      stopA.longitude,
      newStop.latitude,
      newStop.longitude
    );

    // Distance X to B
    const distXB = calculateDistanceMiles(
      newStop.latitude,
      newStop.longitude,
      stopB.latitude,
      stopB.longitude
    );

    // Cost of inserting X between A and B = (A→X + X→B) - A→B
    const insertionCost = distAX + distXB - distAB;

    if (insertionCost < minCost) {
      minCost = insertionCost;
      bestPosition = i + 1;
    }
  }

  // Try position at end (after last stop)
  const lastStop = existingStops[existingStops.length - 1];
  const costAtEnd = calculateDistanceMiles(
    lastStop.latitude,
    lastStop.longitude,
    newStop.latitude,
    newStop.longitude
  );

  if (costAtEnd < minCost) {
    minCost = costAtEnd;
    bestPosition = existingStops.length;
  }

  // Return 1-based order number
  return bestPosition + 1;
}
