import type { VenueDetails, RouteStop } from '@/types/route';

/**
 * Parking Detection Service
 *
 * Analyzes Foursquare venue data to determine parking strategies
 * and calculates walking distances between stops.
 */

/**
 * Calculate haversine distance between two points in meters
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Extract parking information from tips and categories
 */
export function extractParkingInfo(
  tips?: string[],
  categories?: string[]
): {
  hasParking: boolean;
  parkingQuality: 'ample' | 'limited' | 'street' | 'none';
  parkingNotes?: string;
} {
  const parkingKeywords = {
    ample: ['valet', 'garage', 'parking lot', 'ample parking', 'plenty of parking', 'free parking'],
    limited: ['street parking', 'difficult to park', 'hard to find parking', 'limited parking'],
    none: ['no parking', 'parking is terrible', 'impossible to park'],
  };

  let parkingQuality: 'ample' | 'limited' | 'street' | 'none' = 'street';
  let hasParking = true;
  let parkingNotes: string | undefined;

  // Check tips for parking keywords
  if (tips && tips.length > 0) {
    const tipsText = tips.join(' ').toLowerCase();

    // Check for explicit mentions
    for (const [quality, keywords] of Object.entries(parkingKeywords)) {
      for (const keyword of keywords) {
        if (tipsText.includes(keyword.toLowerCase())) {
          parkingQuality = quality as 'ample' | 'limited' | 'street' | 'none';
          parkingNotes = tips.find(tip =>
            tip.toLowerCase().includes(keyword.toLowerCase())
          );

          if (quality === 'none') {
            hasParking = false;
          }

          // Return first match found
          return { hasParking, parkingQuality, parkingNotes };
        }
      }
    }
  }

  // Check categories for parking-related info
  if (categories && categories.length > 0) {
    const categoriesText = categories.join(' ').toLowerCase();

    // Shopping malls likely have ample parking
    if (categoriesText.includes('mall') || categoriesText.includes('shopping center')) {
      return { hasParking: true, parkingQuality: 'ample', parkingNotes: 'Shopping mall parking' };
    }

    // Parks and outdoor venues typically have parking
    if (categoriesText.includes('park') || categoriesText.includes('outdoor')) {
      return { hasParking: true, parkingQuality: 'ample', parkingNotes: 'Outdoor venue parking' };
    }
  }

  // Default assumption
  return { hasParking, parkingQuality };
}

/**
 * Analyze Foursquare venue data to determine parking strategy
 */
export function analyzeParkingAvailability(
  venueDetails?: VenueDetails,
  venueCategories?: string[]
): 'drive-to-venue' | 'park-and-walk' {
  if (!venueDetails) {
    // No venue data, assume we can drive to venue
    return 'drive-to-venue';
  }

  // If parking info already extracted
  if (venueDetails.parkingQuality) {
    if (venueDetails.parkingQuality === 'none' || venueDetails.parkingQuality === 'limited') {
      return 'park-and-walk';
    }
    return 'drive-to-venue';
  }

  // Extract parking info on the fly
  const parkingInfo = extractParkingInfo(venueDetails.tips, venueDetails.categories || venueCategories);

  if (!parkingInfo.hasParking || parkingInfo.parkingQuality === 'limited') {
    return 'park-and-walk';
  }

  // High-end restaurants in urban areas might have limited parking
  if (venueDetails.price && venueDetails.price >= 3) {
    const categories = venueDetails.categories || venueCategories || [];
    const isRestaurant = categories.some(cat =>
      cat.toLowerCase().includes('restaurant') ||
      cat.toLowerCase().includes('dining')
    );

    if (isRestaurant) {
      // Expensive restaurants in urban areas might need park-and-walk
      return 'park-and-walk';
    }
  }

  return 'drive-to-venue';
}

/**
 * Check if two stops are within walking distance
 */
export function isWalkingDistanceBetweenStops(
  stop1: RouteStop,
  stop2: RouteStop,
  maxWalkingDistance: number = 500 // meters (0.3 miles)
): boolean {
  const distance = calculateDistance(
    stop1.latitude,
    stop1.longitude,
    stop2.latitude,
    stop2.longitude
  );

  return distance <= maxWalkingDistance;
}

/**
 * Calculate how many subsequent stops are walkable from a given starting index
 */
export function calculateWalkingThreshold(
  stops: RouteStop[],
  startIndex: number,
  maxWalkingDistance: number = 800 // meters (0.5 miles)
): { canWalkToNext: boolean; walkableStops: number } {
  if (startIndex >= stops.length - 1) {
    return { canWalkToNext: false, walkableStops: 0 };
  }

  let walkableStops = 0;
  let canWalkToNext = false;

  // Check if we can walk to the immediate next stop
  if (isWalkingDistanceBetweenStops(stops[startIndex], stops[startIndex + 1], maxWalkingDistance)) {
    canWalkToNext = true;
    walkableStops = 1;

    // Continue checking subsequent stops
    for (let i = startIndex + 1; i < stops.length - 1; i++) {
      if (isWalkingDistanceBetweenStops(stops[i], stops[i + 1], maxWalkingDistance)) {
        walkableStops++;
      } else {
        break; // Stop when we find a gap too large to walk
      }
    }
  }

  return { canWalkToNext, walkableStops };
}

/**
 * Determine if a location is in a downtown/urban area
 * This is a simple heuristic based on venue density and categories
 */
export function isUrbanArea(
  venueDetails?: VenueDetails,
  nearbyVenues?: number
): boolean {
  // If there are many venues nearby, likely urban
  if (nearbyVenues && nearbyVenues > 20) {
    return true;
  }

  // Check categories for urban indicators
  if (venueDetails?.categories) {
    const urbanCategories = ['downtown', 'urban', 'city center', 'metro'];
    const categoriesText = venueDetails.categories.join(' ').toLowerCase();

    for (const indicator of urbanCategories) {
      if (categoriesText.includes(indicator)) {
        return true;
      }
    }
  }

  return false;
}
