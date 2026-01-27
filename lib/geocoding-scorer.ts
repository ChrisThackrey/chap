/**
 * Geocoding confidence scoring and region validation
 * Scores geocoding results to determine quality and reliability
 */

import type { GeocodingResult } from '@/types/validation';

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
 * Scores a Nominatim geocoding result and returns structured data
 */
export function scoreGeocodingResult(
  response: NominatimResponse,
  query: string
): GeocodingResult {
  const lat = parseFloat(response.lat);
  const lon = parseFloat(response.lon);

  // Calculate confidence based on multiple factors
  let confidence = 0.5; // Base confidence

  // Factor 1: OSM Type (40% weight)
  const osmTypeScore = getOSMTypeScore(response.osm_type, response.class);
  confidence += osmTypeScore * 0.4;

  // Factor 2: Importance score from Nominatim (30% weight)
  if (response.importance !== undefined) {
    confidence += response.importance * 0.3;
  }

  // Factor 3: Bounding box size (20% weight) - smaller is more specific
  const boundingBoxScore = getBoundingBoxScore(response.boundingbox);
  confidence += boundingBoxScore * 0.2;

  // Factor 4: Match quality (10% weight)
  const matchScore = getMatchQualityScore(query, response.display_name);
  confidence += matchScore * 0.1;

  // Normalize confidence to 0-1
  confidence = Math.max(0, Math.min(1, confidence));

  // Determine quality level
  let quality: 'excellent' | 'good' | 'fair' | 'poor';
  if (confidence >= 0.85) {
    quality = 'excellent';
  } else if (confidence >= 0.70) {
    quality = 'good';
  } else if (confidence >= 0.50) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }

  // Parse bounding box if available
  let boundingBox: [number, number, number, number] | undefined;
  if (response.boundingbox && response.boundingbox.length === 4) {
    boundingBox = [
      parseFloat(response.boundingbox[0]), // minLat
      parseFloat(response.boundingbox[1]), // maxLat
      parseFloat(response.boundingbox[2]), // minLon
      parseFloat(response.boundingbox[3]), // maxLon
    ];
  }

  return {
    lat,
    lon,
    confidence,
    quality,
    displayName: response.display_name,
    matchType: response.type,
    boundingBox,
    importance: response.importance,
    osmType: response.osm_type,
  };
}

/**
 * Scores based on OpenStreetMap type
 * More specific types get higher scores
 */
function getOSMTypeScore(osmType?: string, osmClass?: string): number {
  if (!osmType) return 0.3;

  // Exact locations (buildings, POIs)
  if (osmType === 'node' || osmClass === 'amenity' || osmClass === 'shop') {
    return 1.0;
  }

  // Street-level precision
  if (osmType === 'way' || osmClass === 'highway') {
    return 0.8;
  }

  // Area-level precision (neighborhoods, towns)
  if (osmType === 'relation' || osmClass === 'place') {
    return 0.5;
  }

  // Administrative boundaries (cities, counties)
  if (osmClass === 'boundary') {
    return 0.3;
  }

  return 0.4;
}

/**
 * Scores based on bounding box size
 * Smaller bounding boxes indicate more precise locations
 */
function getBoundingBoxScore(boundingBox?: string[]): number {
  if (!boundingBox || boundingBox.length !== 4) {
    return 0.5; // Default score if no bounding box
  }

  const minLat = parseFloat(boundingBox[0]);
  const maxLat = parseFloat(boundingBox[1]);
  const minLon = parseFloat(boundingBox[2]);
  const maxLon = parseFloat(boundingBox[3]);

  const latDiff = Math.abs(maxLat - minLat);
  const lonDiff = Math.abs(maxLon - minLon);
  const area = latDiff * lonDiff;

  // Score based on area size (in square degrees)
  if (area < 0.0001) return 1.0; // Very precise (building-level)
  if (area < 0.001) return 0.9; // Street/block level
  if (area < 0.01) return 0.7; // Neighborhood level
  if (area < 0.1) return 0.5; // District level
  if (area < 1.0) return 0.3; // City level
  return 0.1; // Region/country level
}

/**
 * Scores match quality between query and result
 */
function getMatchQualityScore(query: string, displayName: string): number {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedDisplay = displayName.toLowerCase();

  // Exact match
  if (normalizedDisplay.includes(normalizedQuery)) {
    return 1.0;
  }

  // Check if query words are in display name
  const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length > 2);
  const matchedWords = queryWords.filter((word) =>
    normalizedDisplay.includes(word)
  );

  const matchRatio = queryWords.length > 0 ? matchedWords.length / queryWords.length : 0;
  return matchRatio;
}

/**
 * Validates that coordinates are within expected region
 * Returns true if coordinates are within reasonable distance
 */
export function validateCoordinatesInRegion(
  lat: number,
  lon: number,
  regionCenter: { lat: number; lon: number },
  maxDistanceKm: number = 100
): boolean {
  const distance = calculateDistance(lat, lon, regionCenter.lat, regionCenter.lon);
  return distance <= maxDistanceKm;
}

/**
 * Calculates distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Converts degrees to radians
 */
function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Gets a user-friendly message about geocoding quality
 */
export function getGeocodingQualityMessage(result: GeocodingResult): string {
  switch (result.quality) {
    case 'excellent':
      return 'Precise location found';
    case 'good':
      return 'Good location match';
    case 'fair':
      return 'Approximate location';
    case 'poor':
      return 'Location may be inaccurate';
  }
}
