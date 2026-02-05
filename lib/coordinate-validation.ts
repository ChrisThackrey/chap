/**
 * Coordinate validation utilities
 *
 * Provides functions to validate geographic coordinates before they enter the system.
 * Invalid coordinates can cause crashes in map rendering and route optimization.
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Validates that a coordinate is a valid geographic location
 *
 * @param lat - Latitude value
 * @param lon - Longitude value
 * @returns true if coordinate is valid, false otherwise
 */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat !== 0 &&
    lon !== 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Validates a Coordinate object
 */
export function isValidCoordinateObject(coord: Coordinate): boolean {
  return isValidCoordinate(coord.latitude, coord.longitude);
}

/**
 * Validates an array of coordinates
 *
 * @param coords - Array of coordinates to validate
 * @returns true if all coordinates are valid, false otherwise
 */
export function validateCoordinates(coords: Coordinate[]): boolean {
  return coords.every(coord => isValidCoordinateObject(coord));
}

/**
 * Filters an array of coordinates, keeping only valid ones
 *
 * @param coords - Array of coordinates to filter
 * @returns Array containing only valid coordinates
 */
export function filterValidCoordinates<T extends Coordinate>(coords: T[]): T[] {
  return coords.filter(coord => isValidCoordinateObject(coord));
}

/**
 * Throws an error if any coordinate in the array is invalid
 *
 * @param coords - Array of coordinates to validate
 * @param context - Context string for error message
 * @throws Error if any coordinate is invalid
 */
export function assertValidCoordinates(coords: Coordinate[], context: string = 'Validation'): void {
  for (let i = 0; i < coords.length; i++) {
    const coord = coords[i];
    if (!isValidCoordinateObject(coord)) {
      throw new Error(
        `${context}: Invalid coordinate at index ${i}: ` +
        `lat=${coord.latitude}, lon=${coord.longitude}`
      );
    }
  }
}
