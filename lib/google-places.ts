import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { VenueDetails, VenuePhoto, StopType, ParkingLocation, RouteStop } from '@/types/route';
import { extractParkingInfo } from './parking-detection';
import uuid from 'react-native-uuid';

// Use the same API key as Google Maps (should have Places API enabled)
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';

/**
 * Headers that identify this app to Google so an API key restricted to
 * iOS bundle ids / Android packages still accepts REST calls (Places, Directions,
 * photo media). Without them a restricted key returns 403 PERMISSION_DENIED.
 */
export const GOOGLE_APP_IDENTITY_HEADERS: Record<string, string> = ((): Record<string, string> => {
  const iosBundleId = Constants.expoConfig?.ios?.bundleIdentifier;
  const androidPackage = Constants.expoConfig?.android?.package;
  if (Platform.OS === 'ios' && iosBundleId) {
    return { 'X-Ios-Bundle-Identifier': iosBundleId };
  }
  if (Platform.OS === 'android' && androidPackage) {
    // X-Android-Cert (signing SHA-1) is also required for Android app restrictions;
    // it is only known at build time, so Android keys should be restricted by
    // package + certificate in the Google Cloud console instead.
    return { 'X-Android-Package': androidPackage };
  }
  return {};
})();

// Track if Google Places API has returned persistent errors
let googlePlacesApiUnavailable = false;
let googlePlacesApiUnavailableAt: number | null = null;
const API_RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function checkApiRecovery(): void {
  if (googlePlacesApiUnavailable && googlePlacesApiUnavailableAt) {
    const elapsed = Date.now() - googlePlacesApiUnavailableAt;
    if (elapsed >= API_RETRY_COOLDOWN_MS) {
      console.log('Google Places API cooldown elapsed, allowing retry');
      googlePlacesApiUnavailable = false;
      googlePlacesApiUnavailableAt = null;
    }
  }
}

function markApiUnavailable(): void {
  googlePlacesApiUnavailable = true;
  googlePlacesApiUnavailableAt = Date.now();
}

/**
 * Custom error class for Google Places API errors
 */
export class GooglePlacesAPIError extends Error {
  status: string;
  errorMessage?: string;

  constructor(status: string, errorMessage?: string) {
    super(`Google Places API error: ${status}${errorMessage ? ` - ${errorMessage}` : ''}`);
    this.name = 'GooglePlacesAPIError';
    this.status = status;
    this.errorMessage = errorMessage;
  }
}

/**
 * Google Places API (New) response interfaces
 */
export interface GooglePlaceNew {
  name: string;  // Resource name: "places/{placeId}"
  id: string;    // Place ID
  displayName: {
    text: string;
    languageCode: string;
  };
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  types?: string[];
  rating?: number;        // 1-5 scale
  userRatingCount?: number;
  priceLevel?: 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  currentOpeningHours?: {
    openNow?: boolean;
  };
  photos?: {
    name: string;         // Photo resource name for retrieval
    widthPx: number;
    heightPx: number;
  }[];
  reviews?: {
    text: { text: string };
    rating: number;
    authorAttribution: { displayName: string };
  }[];
  websiteUri?: string;
  internationalPhoneNumber?: string;
  businessStatus?: string;
  editorialSummary?: { text: string };
  parkingOptions?: {
    paidParkingLot?: boolean;
    paidStreetParking?: boolean;
    valetParking?: boolean;
    freeStreetParking?: boolean;
    freeGarageParking?: boolean;
    freeParkingLot?: boolean;
  };
}

interface GoogleTextSearchResponseNew {
  places?: GooglePlaceNew[];
  nextPageToken?: string;
}

/**
 * Map stop type to Google Places includedType (New API uses different values)
 */
function getGooglePlaceType(stopType: StopType): string | undefined {
  const typeMap: Record<StopType, string | undefined> = {
    restaurant: 'restaurant',
    cafe: 'cafe',
    bar: 'bar',
    park: 'park',
    museum: 'museum',
    theater: 'movie_theater',
    viewpoint: 'tourist_attraction',
    activity: 'amusement_center',
    shopping: 'shopping_mall',
  };
  return typeMap[stopType];
}

/**
 * Search for places near a location using Google Places Text Search (New)
 *
 * @param query - Search query (e.g., "romantic Italian restaurant")
 * @param latitude - Latitude of search center
 * @param longitude - Longitude of search center
 * @param radiusMeters - Search radius in meters
 * @param includedType - Optional Google place type to filter by
 * @returns Array of matching places
 */
export async function searchNearbyPlaces(
  query: string,
  latitude: number,
  longitude: number,
  radiusMeters: number = 2000,
  includedType?: string
): Promise<GooglePlaceNew[]> {
  if (!GOOGLE_API_KEY) {
    throw new Error('Google Maps API key not configured');
  }

  checkApiRecovery();

  if (googlePlacesApiUnavailable) {
    return [];
  }

  const requestBody: {
    textQuery: string;
    locationBias: {
      circle: {
        center: { latitude: number; longitude: number };
        radius: number;
      };
    };
    includedType?: string;
    pageSize: number;
  } = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude, longitude },
        radius: Math.min(radiusMeters, 50000),
      },
    },
    pageSize: 20,
  };

  if (includedType) {
    requestBody.includedType = includedType;
  }

  // Field mask for all needed fields
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.types',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.regularOpeningHours',
    'places.currentOpeningHours',
    'places.photos',
    'places.websiteUri',
    'places.businessStatus',
    'places.parkingOptions',
  ].join(',');

  try {
    const response = await fetch(`${GOOGLE_PLACES_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': fieldMask,
        ...GOOGLE_APP_IDENTITY_HEADERS,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || '';
      const errorStatus = errorData.error?.status || `HTTP_${response.status}`;

      // Handle specific error statuses
      if (response.status === 403 || errorStatus === 'PERMISSION_DENIED') {
        markApiUnavailable();
        console.warn(`Google Places API permission denied: ${errorMessage}`);
        return [];
      }

      if (response.status === 429 || errorStatus === 'RESOURCE_EXHAUSTED') {
        markApiUnavailable();
        console.warn('Google Places API quota exceeded');
        return [];
      }

      throw new GooglePlacesAPIError(errorStatus, errorMessage);
    }

    const data: GoogleTextSearchResponseNew = await response.json();
    return data.places || [];
  } catch (error) {
    if (error instanceof GooglePlacesAPIError) {
      throw error;
    }
    console.warn('Google Places API fetch error:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Search places by stop type using appropriate Google place type
 */
export async function searchPlacesByType(
  stopType: StopType,
  latitude: number,
  longitude: number,
  radiusMeters: number = 2000,
  limit: number = 10
): Promise<GooglePlaceNew[]> {
  const includedType = getGooglePlaceType(stopType);
  const results = await searchNearbyPlaces(
    stopType,
    latitude,
    longitude,
    radiusMeters,
    includedType
  );
  return results.slice(0, limit);
}

/**
 * Get detailed information about a specific place
 *
 * @param placeId - Google Place ID
 * @returns Detailed place information
 */
export async function getPlaceDetails(placeId: string): Promise<GooglePlaceNew | null> {
  if (!GOOGLE_API_KEY || googlePlacesApiUnavailable) {
    return null;
  }

  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'location',
    'types',
    'rating',
    'userRatingCount',
    'priceLevel',
    'regularOpeningHours',
    'currentOpeningHours',
    'photos',
    'reviews',
    'websiteUri',
    'internationalPhoneNumber',
    'businessStatus',
    'editorialSummary',
    'parkingOptions',
  ].join(',');

  try {
    const response = await fetch(`${GOOGLE_PLACES_BASE}/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': fieldMask,
        ...GOOGLE_APP_IDENTITY_HEADERS,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('Google Places details fetch error:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Build photo URL from Google Places photo resource name (New API)
 *
 * @param photoResourceName - Photo resource name (format: "places/{placeId}/photos/{photoId}")
 * @param maxWidthPx - Maximum photo width in pixels (default: 400)
 * @param maxHeightPx - Optional maximum photo height in pixels
 * @returns Full photo URL
 */
export function buildPhotoUrl(
  photoResourceName: string,
  maxWidthPx: number = 400,
  maxHeightPx?: number
): string {
  if (!GOOGLE_API_KEY) {
    return '';
  }

  const params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    maxWidthPx: maxWidthPx.toString(),
  });

  if (maxHeightPx) {
    params.append('maxHeightPx', maxHeightPx.toString());
  }

  // photoResourceName format: "places/{placeId}/photos/{photoId}"
  return `${GOOGLE_PLACES_BASE}/${photoResourceName}/media?${params}`;
}

/**
 * Get rating color based on rating value (Google uses 1-5 scale)
 */
function getRatingColor(rating?: number): string | undefined {
  if (!rating) return undefined;

  // Convert 5-scale to color thresholds
  if (rating >= 4.5) return '#00b551'; // Excellent - Green
  if (rating >= 4.0) return '#73cf42'; // Great - Light Green
  if (rating >= 3.5) return '#ffc700'; // Good - Yellow
  if (rating >= 3.0) return '#ff8c00'; // Average - Orange
  return '#ff6b6b'; // Below Average - Red
}

/**
 * Map Google Place (New API) to VenueDetails format
 * Normalizes data to match the existing VenueDetails interface
 *
 * @param place - Google Place result object (New API format)
 * @returns VenueDetails object for app use
 */
export function mapGooglePlaceToVenueDetails(place: GooglePlaceNew): VenueDetails {
  // Convert Google photos to VenuePhoto format
  // Store photo resource name in prefix (format: "places/{id}/photos/{photoId}")
  const photos: VenuePhoto[] = (place.photos || []).slice(0, 5).map(photo => ({
    prefix: photo.name,
    suffix: '',
    width: photo.widthPx,
    height: photo.heightPx,
  }));

  // Extract reviews as tips (limit to 3)
  const tips: string[] = (place.reviews || [])
    .slice(0, 3)
    .filter(review => review.text?.text)
    .map(review => review.text.text);

  // Map Google types to categories (filter out generic types)
  const categories: string[] = (place.types || [])
    .filter(type => !['point_of_interest', 'establishment'].includes(type))
    .map(type => type.replace(/_/g, ' '));

  // Convert Google rating (1-5) to app scale (0-10)
  const normalizedRating = place.rating ? place.rating * 2 : undefined;

  // Format hours
  const hours = place.regularOpeningHours?.weekdayDescriptions?.join('\n');

  // Map price level enum to number
  const priceMap: Record<string, number> = {
    'PRICE_LEVEL_FREE': 0,
    'PRICE_LEVEL_INEXPENSIVE': 1,
    'PRICE_LEVEL_MODERATE': 2,
    'PRICE_LEVEL_EXPENSIVE': 3,
    'PRICE_LEVEL_VERY_EXPENSIVE': 4,
  };
  const price = place.priceLevel ? priceMap[place.priceLevel] : undefined;

  // Extract parking info from native parkingOptions (New API feature!)
  const parkingOptions = place.parkingOptions;
  let hasParking = false;
  let parkingQuality: 'ample' | 'limited' | 'street' | 'none' = 'none';
  let parkingNotes: string | undefined;

  if (parkingOptions) {
    const hasFreeParking = parkingOptions.freeParkingLot || parkingOptions.freeGarageParking || parkingOptions.freeStreetParking;
    const hasPaidParking = parkingOptions.paidParkingLot || parkingOptions.paidStreetParking || parkingOptions.valetParking;

    hasParking = hasFreeParking || hasPaidParking || false;

    if (parkingOptions.freeParkingLot || parkingOptions.freeGarageParking) {
      parkingQuality = 'ample';
      parkingNotes = 'Free parking available';
    } else if (parkingOptions.paidParkingLot) {
      parkingQuality = 'ample';
      parkingNotes = 'Paid parking lot';
    } else if (parkingOptions.freeStreetParking || parkingOptions.paidStreetParking) {
      parkingQuality = 'street';
      parkingNotes = parkingOptions.freeStreetParking ? 'Free street parking' : 'Paid street parking';
    } else if (parkingOptions.valetParking) {
      parkingQuality = 'ample';
      parkingNotes = 'Valet parking available';
    }
  }

  // If no native parking data, fall back to extracting from tips/categories
  if (!hasParking && (tips.length > 0 || categories.length > 0)) {
    const extractedParkingInfo = extractParkingInfo(tips, categories);
    if (extractedParkingInfo.hasParking) {
      hasParking = extractedParkingInfo.hasParking;
      parkingQuality = extractedParkingInfo.parkingQuality || 'none';
      parkingNotes = extractedParkingInfo.parkingNotes;
    }
  }

  return {
    placeId: place.id,
    provider: 'google',
    rating: normalizedRating,
    ratingColor: getRatingColor(place.rating),
    price,
    categories: categories.length > 0 ? categories : undefined,
    photos: photos.length > 0 ? photos : undefined,
    hours,
    isOpen: place.currentOpeningHours?.openNow ?? place.regularOpeningHours?.openNow,
    tips: tips.length > 0 ? tips : undefined,
    website: place.websiteUri,
    phone: place.internationalPhoneNumber,
    verified: place.businessStatus === 'OPERATIONAL',
    hasParking,
    parkingQuality: hasParking ? parkingQuality : undefined,
    parkingNotes,
  };
}

/**
 * Build a photo URL for display in the app
 * Handles the difference between Google (New API: photo resource name in prefix)
 * and Foursquare (prefix+suffix pattern)
 */
export function buildDisplayPhotoUrl(photo: VenuePhoto, size: string = '400x300'): string {
  // Check if this is a Google photo (New API format: "places/{id}/photos/{photoId}")
  if (photo.suffix === '' && photo.prefix && photo.prefix.startsWith('places/')) {
    const [width] = size.split('x').map(Number);
    return buildPhotoUrl(photo.prefix, width || 400);
  }

  // Check if this is a legacy Google photo (photo_reference from old API)
  // Keep for backwards compatibility with existing saved routes
  if (photo.suffix === '' && photo.prefix && !photo.prefix.startsWith('http') && !photo.prefix.startsWith('places/')) {
    const maxWidth = parseInt(size.split('x')[0], 10) || 400;
    // Legacy fallback - this won't work long-term as the old API is deprecated
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photo.prefix}&key=${GOOGLE_API_KEY}`;
  }

  // Foursquare format
  return `${photo.prefix}${size}${photo.suffix}`;
}

/**
 * Image source for a venue photo, including the app-identity headers that a
 * bundle-id-restricted Google key requires for Places photo media requests.
 */
export function buildDisplayPhotoSource(photo: VenuePhoto, size: string = '400x300'): { uri: string; headers?: Record<string, string> } {
  const uri = buildDisplayPhotoUrl(photo, size);
  const isGooglePhoto = uri.startsWith(GOOGLE_PLACES_BASE) || uri.startsWith('https://maps.googleapis.com/');
  return isGooglePhoto && Object.keys(GOOGLE_APP_IDENTITY_HEADERS).length > 0
    ? { uri, headers: GOOGLE_APP_IDENTITY_HEADERS }
    : { uri };
}

/**
 * Check if Google Places API is configured and available
 */
export function isGooglePlacesConfigured(): boolean {
  return !!GOOGLE_API_KEY && GOOGLE_API_KEY.length > 0 && !googlePlacesApiUnavailable;
}

/**
 * Infer a StopType from Google Places type strings
 */
export function inferStopTypeFromGoogleTypes(googleTypes: string[]): StopType {
  const typeSet = new Set(googleTypes);
  if (typeSet.has('restaurant')) return 'restaurant';
  if (typeSet.has('cafe')) return 'cafe';
  if (typeSet.has('bar')) return 'bar';
  if (typeSet.has('park') || typeSet.has('national_park')) return 'park';
  if (typeSet.has('museum') || typeSet.has('art_gallery')) return 'museum';
  if (typeSet.has('movie_theater') || typeSet.has('performing_arts_theater')) return 'theater';
  if (typeSet.has('tourist_attraction') || typeSet.has('scenic_lookout')) return 'viewpoint';
  if (typeSet.has('shopping_mall') || typeSet.has('clothing_store') || typeSet.has('book_store')) return 'shopping';
  return 'activity';
}

/**
 * Convert a Google Place result directly into a RouteStop
 */
export function googlePlaceToRouteStop(place: GooglePlaceNew, order: number): RouteStop | null {
  const lat = place.location?.latitude ?? 0;
  const lon = place.location?.longitude ?? 0;
  if (lat === 0 && lon === 0) return null;
  if (!place.displayName?.text) return null;

  const stopType = inferStopTypeFromGoogleTypes(place.types || []);
  const durations: Record<StopType, number> = {
    restaurant: 90, cafe: 45, bar: 60, park: 45,
    museum: 90, theater: 120, viewpoint: 30, activity: 60, shopping: 60,
  };
  return {
    id: uuid.v4() as string,
    name: place.displayName.text,
    type: stopType,
    description: place.editorialSummary?.text || `A ${stopType} in the area`,
    address: place.formattedAddress || '',
    latitude: lat,
    longitude: lon,
    duration: durations[stopType] || 60,
    order,
    venueDetails: mapGooglePlaceToVenueDetails(place),
    validationStatus: 'verified',
  };
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
  if (!GOOGLE_API_KEY || googlePlacesApiUnavailable) {
    return null;
  }

  try {
    const results = await searchNearbyPlaces(
      'parking',
      latitude,
      longitude,
      radius,
      'parking'
    );

    if (results.length === 0) {
      return null;
    }

    // Return the closest parking location
    const closestPlace = results[0];
    if (!closestPlace.location || !closestPlace.displayName?.text) {
      return null;
    }

    const distance = calculateDistance(
      latitude,
      longitude,
      closestPlace.location.latitude,
      closestPlace.location.longitude
    );

    return {
      name: closestPlace.displayName.text,
      latitude: closestPlace.location.latitude,
      longitude: closestPlace.location.longitude,
      address: closestPlace.formattedAddress || '',
      distanceToVenue: distance * 1000, // Convert km to meters
    };
  } catch (error) {
    console.warn('Error searching for parking:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Calculate distance between two coordinates in kilometers (haversine)
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

// Export the legacy type alias for backwards compatibility in venue-validator.ts
export type GooglePlaceResult = GooglePlaceNew;
