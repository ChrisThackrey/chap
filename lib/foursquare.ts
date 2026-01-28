import { VenueDetails, VenuePhoto, StopType, ParkingLocation } from '@/types/route';
import { getCategoryQueryString, getParkingCategoryQueryString } from '@/constants/foursquare-categories';
import { extractParkingInfo } from './parking-detection';

const FOURSQUARE_API_KEY = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY;
const FOURSQUARE_API_BASE = 'https://api.foursquare.com/v3';

// Track if Foursquare API has returned errors (401/410)
// Reset after 5 minutes to allow retry in case API recovers
let foursquareApiDeprecated = false;
let foursquareApiDeprecatedAt: number | null = null;
const API_RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function checkApiRecovery(): void {
  if (foursquareApiDeprecated && foursquareApiDeprecatedAt) {
    const elapsed = Date.now() - foursquareApiDeprecatedAt;
    if (elapsed >= API_RETRY_COOLDOWN_MS) {
      console.log('🔄 Foursquare API cooldown elapsed, allowing retry');
      foursquareApiDeprecated = false;
      foursquareApiDeprecatedAt = null;
    }
  }
}

function markApiDeprecated(): void {
  markApiDeprecated();
  foursquareApiDeprecatedAt = Date.now();
}

/**
 * Custom error class for Foursquare API errors
 * Includes status code and response body for better error classification
 */
export class FoursquareAPIError extends Error {
  statusCode: number;
  statusText: string;
  responseBody: string;

  constructor(statusCode: number, statusText: string, responseBody: string) {
    super(`Foursquare API error (${statusCode}): ${statusText}`);
    this.name = 'FoursquareAPIError';
    this.statusCode = statusCode;
    this.statusText = statusText;
    this.responseBody = responseBody;
  }
}

/**
 * Foursquare API response interfaces
 */
interface FoursquareVenue {
  fsq_id: string;
  name: string;
  location: {
    address?: string;
    locality?: string;
    region?: string;
    postcode?: string;
    country?: string;
    formatted_address?: string;
  };
  geocodes: {
    main: {
      latitude: number;
      longitude: number;
    };
  };
  categories?: Array<{
    id: number;
    name: string;
  }>;
  rating?: number;
  price?: number;
  hours?: {
    display?: string;
    is_open_now?: boolean;
  };
  photos?: Array<{
    id: string;
    prefix: string;
    suffix: string;
    width: number;
    height: number;
  }>;
  tips?: Array<{
    text: string;
  }>;
  website?: string;
  tel?: string;
  verified?: boolean;
}

interface FoursquareSearchResponse {
  results: FoursquareVenue[];
}

/**
 * Search for venues near a location
 *
 * @param query - Search query (e.g., "romantic Italian restaurant")
 * @param latitude - Latitude of search center
 * @param longitude - Longitude of search center
 * @param radius - Search radius in meters (default: 2000)
 * @param limit - Maximum number of results (default: 10)
 * @param categories - Optional Foursquare category IDs to filter by
 * @returns Array of matching venues
 */
export async function searchNearbyVenues(
  query: string,
  latitude: number,
  longitude: number,
  radius: number = 2000,
  limit: number = 10,
  categories?: string
): Promise<FoursquareVenue[]> {
  if (!FOURSQUARE_API_KEY) {
    throw new Error('Foursquare API key not configured');
  }

  // Check if API has recovered from previous errors
  checkApiRecovery();

  // Skip API call if we know it's deprecated
  if (foursquareApiDeprecated) {
    return [];
  }

  const params = new URLSearchParams({
    query,
    ll: `${latitude},${longitude}`,
    radius: radius.toString(),
    limit: limit.toString(),
    sort: 'RELEVANCE',
    ...(categories && { categories }),
  });

  const response = await fetch(`${FOURSQUARE_API_BASE}/places/search?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': FOURSQUARE_API_KEY!,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    // Handle 401 Unauthorized - invalid API key
    if (response.status === 401) {
      markApiDeprecated();
      const errorBody = await response.text().catch(() => 'No response body');
      console.warn('Foursquare API key invalid (401 Unauthorized). Falling back to geocoding.');
      console.warn('Error details:', errorBody);
      console.warn('API key prefix:', FOURSQUARE_API_KEY?.substring(0, 10) + '...');
      console.warn('Ensure your key is a V3 Places API key from: https://location.foursquare.com/developer/');
      console.warn('The key should start with "fsq3" for V3 API keys.');
      return [];
    }
    // Handle 410 Gone - API deprecated for this account
    if (response.status === 410) {
      markApiDeprecated();
      console.warn('Foursquare V3 API unavailable (410 Gone). Falling back to geocoding.');
      return [];
    }
    const errorText = await response.text();
    throw new FoursquareAPIError(response.status, response.statusText, errorText);
  }

  const data: FoursquareSearchResponse = await response.json();
  return data.results || [];
}

/**
 * Get detailed information about a specific venue
 *
 * @param placeId - Foursquare FSQ ID
 * @returns Detailed venue information
 */
export async function getPlaceDetails(placeId: string): Promise<FoursquareVenue | null> {
  if (!FOURSQUARE_API_KEY || foursquareApiDeprecated) {
    return null;
  }

  const fields = [
    'fsq_id',
    'name',
    'location',
    'geocodes',
    'categories',
    'rating',
    'price',
    'hours',
    'photos',
    'tips',
    'website',
    'tel',
    'verified',
  ].join(',');

  const response = await fetch(
    `${FOURSQUARE_API_BASE}/places/${placeId}?fields=${fields}`,
    {
      method: 'GET',
      headers: {
        'Authorization': FOURSQUARE_API_KEY!,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 404 || response.status === 410) {
      if (response.status === 401 || response.status === 410) {
        markApiDeprecated();
      }
      return null;
    }
    const errorText = await response.text();
    throw new FoursquareAPIError(response.status, response.statusText, errorText);
  }

  const venue: FoursquareVenue = await response.json();
  return venue;
}

/**
 * Build photo URL from Foursquare photo data
 *
 * @param photo - Foursquare photo object
 * @param size - Desired photo size (default: '300x300')
 * @returns Full photo URL
 */
export function buildPhotoUrl(photo: VenuePhoto, size: string = '300x300'): string {
  return `${photo.prefix}${size}${photo.suffix}`;
}

/**
 * Map Foursquare venue to VenueDetails
 *
 * @param venue - Foursquare venue object
 * @returns VenueDetails object for app use
 */
export function mapVenueToDetails(venue: FoursquareVenue): VenueDetails {
  const photos: VenuePhoto[] = (venue.photos || []).slice(0, 5).map(photo => ({
    prefix: photo.prefix,
    suffix: photo.suffix,
    width: photo.width,
    height: photo.height,
  }));

  const tips: string[] = (venue.tips || []).slice(0, 3).map(tip => tip.text);

  const categories: string[] = (venue.categories || []).map(cat => cat.name);

  // Extract parking information
  const parkingInfo = extractParkingInfo(tips, categories);

  return {
    placeId: venue.fsq_id,
    rating: venue.rating,
    ratingColor: getRatingColor(venue.rating),
    price: venue.price,
    categories,
    photos: photos.length > 0 ? photos : undefined,
    hours: venue.hours?.display,
    isOpen: venue.hours?.is_open_now,
    tips: tips.length > 0 ? tips : undefined,
    website: venue.website,
    phone: venue.tel,
    verified: venue.verified,
    hasParking: parkingInfo.hasParking,
    parkingQuality: parkingInfo.parkingQuality,
    parkingNotes: parkingInfo.parkingNotes,
  };
}

/**
 * Get Foursquare rating color based on rating value
 * Foursquare uses a color-coded rating system
 */
function getRatingColor(rating?: number): string | undefined {
  if (!rating) return undefined;

  if (rating >= 9.0) return '#00b551'; // Excellent - Green
  if (rating >= 8.0) return '#73cf42'; // Great - Light Green
  if (rating >= 7.0) return '#ffc700'; // Good - Yellow
  if (rating >= 6.0) return '#ff8c00'; // Average - Orange
  return '#ff6b6b'; // Below Average - Red
}

/**
 * Calculate distance between two coordinates in kilometers
 *
 * @param lat1 - First latitude
 * @param lon1 - First longitude
 * @param lat2 - Second latitude
 * @param lon2 - Second longitude
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of Earth in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if Foursquare API is configured and available
 */
export function isFoursquareConfigured(): boolean {
  return !!FOURSQUARE_API_KEY && FOURSQUARE_API_KEY.length > 0 && !foursquareApiDeprecated;
}

/**
 * Search venues by type near a location
 * Convenience method that uses category filtering
 *
 * @param stopType - App StopType to search for
 * @param latitude - Latitude of search center
 * @param longitude - Longitude of search center
 * @param radius - Search radius in meters
 * @param limit - Maximum number of results
 * @returns Array of matching venues
 */
export async function searchVenuesByType(
  stopType: StopType,
  latitude: number,
  longitude: number,
  radius: number = 2000,
  limit: number = 10
): Promise<FoursquareVenue[]> {
  const categories = getCategoryQueryString(stopType);
  const query = stopType; // Use type as base query

  return searchNearbyVenues(query, latitude, longitude, radius, limit, categories);
}

/**
 * Search for parking near a venue location
 *
 * @param latitude - Venue latitude
 * @param longitude - Venue longitude
 * @param radius - Search radius in meters (default: 500m)
 * @returns Closest parking location, or null if none found
 */
export async function searchParkingNearVenue(
  latitude: number,
  longitude: number,
  radius: number = 500
): Promise<ParkingLocation | null> {
  if (!FOURSQUARE_API_KEY || foursquareApiDeprecated) {
    return null;
  }

  try {
    const categories = getParkingCategoryQueryString();
    const venues = await searchNearbyVenues(
      'parking',
      latitude,
      longitude,
      radius,
      5, // Limit to 5 results
      categories
    );

    if (venues.length === 0) {
      return null;
    }

    // Return the closest parking location
    const closestVenue = venues[0];
    const distance = calculateDistance(
      latitude,
      longitude,
      closestVenue.geocodes.main.latitude,
      closestVenue.geocodes.main.longitude
    );

    return {
      name: closestVenue.name,
      latitude: closestVenue.geocodes.main.latitude,
      longitude: closestVenue.geocodes.main.longitude,
      address: closestVenue.location.formatted_address || closestVenue.location.address || '',
      distanceToVenue: distance * 1000, // Convert km to meters
    };
  } catch (error) {
    console.warn('Error searching for parking:', error instanceof Error ? error.message : error);
    return null;
  }
}
