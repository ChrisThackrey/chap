import uuid from 'react-native-uuid';
import { RouteStop, UserLocation, VenueDetails } from '@/types/route';
import { ValidationWarning, RouteValidationResult } from '@/types/validation';
import {
  searchNearbyVenues as searchFoursquareVenues,
  searchVenuesByType as searchFoursquareByType,
  getPlaceDetails as getFoursquareDetails,
  mapVenueToDetails as mapFoursquareToDetails,
  isFoursquareConfigured,
} from './foursquare';
import {
  searchNearbyPlaces as searchGooglePlaces,
  searchPlacesByType as searchGoogleByType,
  getPlaceDetails as getGoogleDetails,
  mapGooglePlaceToVenueDetails,
  isGooglePlacesConfigured,
  GooglePlaceNew,
} from './google-places';
import { geocodeAddressWithScore, reverseGeocode } from './geocoding';
import { validateAddressQuality } from './address-validator';
import {
  classifyError,
  shouldFailFast,
  createLowConfidenceError,
  createRegionMismatchError,
} from './error-classifier';
import { validateCoordinatesInRegion } from './geocoding-scorer';

// Venue result from any provider (normalized shape for internal use)
interface NormalizedVenue {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  rating?: number;
  categories?: string[];
  provider: 'google' | 'foursquare';
  rawData: any;
}

/**
 * Google Places API maximum radius (in meters)
 * Requests with radius > 50000 return INVALID_ARGUMENT error
 */
const MAX_GOOGLE_PLACES_RADIUS = 50000;

/**
 * Validation configuration
 */
const VALIDATION_CONFIG = {
  INITIAL_RADIUS: 16093, // 10 miles initial search radius (in meters)
  EXPANDED_RADIUS: 96561, // 60 miles fallback radius (in meters)
  MIN_RATING: 5.0, // Lowered threshold to allow more diverse venues (was 7.0)
  MAX_DISTANCE_KM: 96.5, // Maximum acceptable distance from location (60 miles)
  SEARCH_LIMIT: 30, // Increased for more options to choose from (was 20)
  MIN_CONFIDENCE: 0.5, // Minimum geocoding confidence to accept without warning
  MAX_REGION_DISTANCE_KM: 100, // Maximum distance from user location for region validation
  RANDOMNESS_FACTOR: 0.3, // Factor for adding randomness to venue selection (0-1)
};

// Store search keywords for use in scoring
// NOTE: This is module-level state. In a single-user mobile app context,
// concurrent validation calls are rare. If concurrent calls become an issue,
// refactor to pass keywords through the function chain.
let currentSearchKeywords: string[] = [];

/**
 * Determine which venue provider to use based on configuration
 * Priority: Google Places > Foursquare > Geocoding only
 */
function getAvailableProvider(): 'google' | 'foursquare' | 'geocoding' {
  if (isGooglePlacesConfigured()) {
    return 'google';
  }
  if (isFoursquareConfigured()) {
    return 'foursquare';
  }
  return 'geocoding';
}

/**
 * Validate and enrich route stops with real venue data
 * Uses provider fallback chain: Google Places -> Foursquare -> Geocoding
 *
 * @param stops - Array of AI-generated stops
 * @param userLocation - Optional user location for context
 * @param maxDistanceMiles - Optional maximum search radius in miles (default: 60)
 * @param searchKeywords - Optional keywords extracted from user prompt for better matching
 * @returns Object containing validated stops and validation warnings
 */
export async function validateAndEnrichStops(
  stops: Partial<RouteStop>[],
  userLocation?: UserLocation,
  maxDistanceMiles?: number,
  searchKeywords?: string[],
  originalPrompt?: string
): Promise<RouteValidationResult<RouteStop[]>> {
  // Store keywords for use in scoring
  currentSearchKeywords = searchKeywords || [];

  // Calculate search radius in meters from miles, or use default expanded radius
  const maxRadiusMeters = maxDistanceMiles
    ? maxDistanceMiles * 1609.344
    : VALIDATION_CONFIG.EXPANDED_RADIUS;
  const maxDistanceKm = maxDistanceMiles
    ? maxDistanceMiles * 1.609344
    : VALIDATION_CONFIG.MAX_DISTANCE_KM;
  const warnings: ValidationWarning[] = [];

  // Determine primary provider
  const primaryProvider = getAvailableProvider();
  console.log(`Using ${primaryProvider} as primary venue provider`);

  // If no venue API is available, fall back to geocoding only
  if (primaryProvider === 'geocoding') {
    console.warn('No venue API available, using geocoding only');
    warnings.push({
      severity: 'info',
      message: 'Using geocoding for venue locations (limited details).',
      suggestedAction: 'Configure Google Places or Foursquare API for verified venue data',
    });
    const geocodedStops = await fallbackToGeocoding(stops, userLocation);
    warnings.push(...geocodedStops.warnings);
    return { data: geocodedStops.data, warnings };
  }

  const validatedStops: RouteStop[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    try {
      const result = await validateStopWithProviderChain(
        stop,
        userLocation,
        i,
        maxRadiusMeters,
        maxDistanceKm,
        primaryProvider,
        originalPrompt,
        validatedStops
      );
      validatedStops.push(result.data);
      warnings.push(...result.warnings);
    } catch (error) {
      const classifiedError = classifyError(error);

      // Fail fast for auth errors
      if (shouldFailFast(classifiedError)) {
        warnings.push({
          severity: 'error',
          message: classifiedError.userMessage,
          suggestedAction: classifiedError.suggestedAction,
        });
        throw error;
      }

      console.warn(`Error validating stop ${stop.name}:`, classifiedError.userMessage);
      warnings.push({
        severity: 'warning',
        stopIndex: i,
        stopName: stop.name,
        message: `Failed to validate "${stop.name}": ${classifiedError.userMessage}`,
        suggestedAction: classifiedError.suggestedAction,
      });

      // Fall back to geocoding for this stop
      const fallbackResult = await validateStopWithGeocoding(stop, userLocation, i);
      validatedStops.push(fallbackResult.data);
      warnings.push(...fallbackResult.warnings);
    }
  }

  return { data: validatedStops, warnings };
}

/**
 * Validate a single stop using provider chain (Google -> Foursquare -> Geocoding)
 */
async function validateStopWithProviderChain(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation,
  stopIndex?: number,
  maxRadiusMeters?: number,
  maxDistanceKm?: number,
  primaryProvider?: 'google' | 'foursquare',
  originalPrompt?: string,
  previousStops?: RouteStop[]
): Promise<RouteValidationResult<RouteStop>> {
  const expandedRadius = maxRadiusMeters || VALIDATION_CONFIG.EXPANDED_RADIUS;
  const regionDistanceKm = maxDistanceKm || VALIDATION_CONFIG.MAX_REGION_DISTANCE_KM;

  // Progressive radius tightening: later stops search in a smaller area
  const stopNum = (stopIndex ?? 0) + 1;
  const radiusScale = stopNum === 1 ? 1.0 : stopNum === 2 ? 0.8 : stopNum === 3 ? 0.65 : 0.5;
  const effectiveRadius = expandedRadius * radiusScale;
  if (!stop.name || !stop.type || !stop.address) {
    throw new Error('Invalid stop: missing required fields');
  }

  const warnings: ValidationWarning[] = [];

  // LAYER 1: Pre-validate address quality
  const addressQuality = validateAddressQuality(stop.address);
  if (!addressQuality.isValid || addressQuality.confidence < 0.6) {
    warnings.push({
      severity: 'warning',
      stopIndex,
      stopName: stop.name,
      message: `Address for "${stop.name}" may be too generic: ${addressQuality.issues.join(', ')}`,
      suggestedAction: addressQuality.suggestions?.[0],
    });
  }

  // Strategy 0: Search Google Places directly with the user's original prompt
  // This bypasses the AI-reinterpreted venue name and finds what the user actually asked for
  if (originalPrompt && isGooglePlacesConfigured()) {
    const directResult = await tryDirectPromptSearch(
      originalPrompt,
      stop,
      userLocation,
      stopIndex,
      effectiveRadius,
      regionDistanceKm,
      warnings,
      previousStops
    );
    if (directResult) {
      console.log(`[Strategy 0] Found venue directly from prompt: ${directResult.data.name}`);
      return directResult;
    }
    console.log(`[Strategy 0] No direct match for prompt, falling through to Strategy 1+`);
  }

  // Try Google Places first (if available)
  if (primaryProvider === 'google' || isGooglePlacesConfigured()) {
    const googleResult = await tryGooglePlaces(stop, userLocation, stopIndex, effectiveRadius, regionDistanceKm, warnings, undefined, previousStops);
    if (googleResult) {
      return googleResult;
    }
    console.log(`Google Places returned no results for ${stop.name}, trying Foursquare`);
  }

  // Try Foursquare as fallback (if available)
  if (isFoursquareConfigured()) {
    const foursquareResult = await tryFoursquare(stop, userLocation, stopIndex, effectiveRadius, regionDistanceKm, warnings, undefined, previousStops);
    if (foursquareResult) {
      return foursquareResult;
    }
    console.log(`Foursquare returned no results for ${stop.name}, falling back to geocoding`);
  }

  // Final fallback: Use AI suggestion with geocoding
  console.log(`No venue data found for ${stop.name}, using geocoding`);
  return await validateStopWithGeocoding(stop, userLocation, stopIndex);
}

/**
 * Strategy 0: Search Google Places directly with the user's original prompt text
 * This finds the venue the user actually asked for, bypassing AI reinterpretation
 */
async function tryDirectPromptSearch(
  originalPrompt: string,
  stop: Partial<RouteStop>,
  userLocation?: UserLocation,
  stopIndex?: number,
  expandedRadius?: number,
  regionDistanceKm?: number,
  warnings?: ValidationWarning[],
  previousStops?: RouteStop[]
): Promise<RouteValidationResult<RouteStop> | null> {
  try {
    const location = await getSearchCenter(stop, userLocation, previousStops);

    console.log(`🔍 [Strategy 0] Searching Google Places with original prompt: "${originalPrompt}"`);

    // Search Google Places Text Search directly with the user's original prompt
    // Cap radius at Google Places API limit (50,000m) to avoid INVALID_ARGUMENT errors
    const searchRadius = Math.min(expandedRadius || VALIDATION_CONFIG.EXPANDED_RADIUS, MAX_GOOGLE_PLACES_RADIUS);
    const places = await searchGooglePlaces(
      originalPrompt,
      location.latitude,
      location.longitude,
      searchRadius
    );

    if (places.length === 0) {
      console.log(`[Strategy 0] No results for original prompt`);
      return null;
    }

    // Filter for valid coordinates
    const validPlaces = places.filter(
      p => p.location &&
        typeof p.location.latitude === 'number' &&
        typeof p.location.longitude === 'number' &&
        !isNaN(p.location.latitude) &&
        !isNaN(p.location.longitude)
    );

    if (validPlaces.length === 0) {
      console.log(`[Strategy 0] No places with valid coordinates`);
      return null;
    }

    // Take the top result (Google's relevance ranking handles venue name matching)
    const bestPlace = validPlaces[0];

    // Validate distance from user location
    if (userLocation && regionDistanceKm) {
      const distanceKm = calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        bestPlace.location!.latitude,
        bestPlace.location!.longitude
      );

      console.log(`📏 [Strategy 0] Venue "${bestPlace.displayName.text}" is ${distanceKm.toFixed(2)} km away (limit: ${regionDistanceKm.toFixed(2)} km)`);

      if (distanceKm > regionDistanceKm) {
        console.log(`[Strategy 0] Venue exceeds radius, falling through`);
        return null;
      }

      // Warn if near edge of radius
      if (warnings && distanceKm > regionDistanceKm * 0.8) {
        const distanceMiles = distanceKm * 0.621371;
        const limitMiles = regionDistanceKm * 0.621371;
        warnings.push({
          severity: 'info',
          stopIndex,
          stopName: bestPlace.displayName.text,
          message: `"${bestPlace.displayName.text}" is ${distanceMiles.toFixed(1)} miles from center (near edge of ${limitMiles.toFixed(0)} mile radius)`,
        });
      }
    }

    // Get detailed information
    const placeDetails = await getGoogleDetails(bestPlace.id);
    const place = placeDetails || bestPlace;

    const enrichedStop: RouteStop = {
      id: uuid.v4() as string,
      name: place.displayName.text,
      type: stop.type!,
      description: stop.description || '',
      address: place.formattedAddress || stop.address!,
      latitude: place.location?.latitude ?? bestPlace.location!.latitude,
      longitude: place.location?.longitude ?? bestPlace.location!.longitude,
      duration: stop.duration || 60,
      order: stop.order || 1,
      venueDetails: mapGooglePlaceToVenueDetails(place),
      validationStatus: 'verified',
    };

    console.log(`✅ [Strategy 0] Validated venue: ${enrichedStop.name}`);
    return { data: enrichedStop, warnings: warnings || [] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[Strategy 0] Failed: ${errorMsg}`);
    return null;
  }
}

/**
 * Try to find venue using Google Places API
 */
async function tryGooglePlaces(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation,
  stopIndex?: number,
  expandedRadius?: number,
  regionDistanceKm?: number,
  warnings?: ValidationWarning[],
  isLastResort?: boolean,
  previousStops?: RouteStop[]
): Promise<RouteValidationResult<RouteStop> | null> {
  try {
    const location = await getSearchCenter(stop, userLocation, previousStops);
    const searchQuery = buildSearchQuery(stop);

    // Strategy 1: Search by name and description
    let places = await searchGooglePlaces(
      searchQuery,
      location.latitude,
      location.longitude,
      VALIDATION_CONFIG.INITIAL_RADIUS
    );

    // Strategy 2: Search by type only
    if (places.length === 0) {
      places = await searchGoogleByType(
        stop.type!,
        location.latitude,
        location.longitude,
        VALIDATION_CONFIG.INITIAL_RADIUS,
        VALIDATION_CONFIG.SEARCH_LIMIT
      );
    }

    // Strategy 3: Expand radius (capped at Google Places API limit)
    if (places.length === 0 && expandedRadius) {
      places = await searchGoogleByType(
        stop.type!,
        location.latitude,
        location.longitude,
        Math.min(expandedRadius, MAX_GOOGLE_PLACES_RADIUS),
        VALIDATION_CONFIG.SEARCH_LIMIT
      );
    }

    if (places.length === 0) {
      return null;
    }

    // Normalize Google results for scoring (New API format)
    // Filter out venues with invalid/missing coordinates
    const normalizedVenues: NormalizedVenue[] = places
      .filter(p => p.location &&
                   typeof p.location.latitude === 'number' &&
                   typeof p.location.longitude === 'number' &&
                   !isNaN(p.location.latitude) &&
                   !isNaN(p.location.longitude))
      .map(p => ({
        id: p.id,
        name: p.displayName.text,
        latitude: p.location!.latitude,
        longitude: p.location!.longitude,
        address: p.formattedAddress,
        rating: p.rating ? p.rating * 2 : undefined, // Convert 5-scale to 10-scale
        categories: p.types,
        provider: 'google' as const,
        rawData: p,
      }));

    if (normalizedVenues.length === 0) {
      console.warn(`[Google] No venues with valid coordinates found for "${stop.name}"`);
      return null;
    }

    const bestVenue = selectBestNormalizedVenue(normalizedVenues, stop, previousStops);

    // Validate distance from user location (enforce radius limit)
    if (userLocation && regionDistanceKm) {
      const distanceKm = calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        bestVenue.latitude,
        bestVenue.longitude
      );

      console.log(`📏 [Google] Venue "${bestVenue.name}" is ${distanceKm.toFixed(2)} km away (limit: ${regionDistanceKm.toFixed(2)} km)`);

      // Hard reject if venue exceeds radius (unless this is last resort)
      if (distanceKm > regionDistanceKm && !isLastResort) {
        console.warn(`❌ [Google] Venue "${bestVenue.name}" exceeds radius limit (${distanceKm.toFixed(1)}km > ${regionDistanceKm.toFixed(1)}km), rejecting`);
        return null; // This will cause fallback to next provider or geocoding
      }

      // On last resort, accept but warn
      if (distanceKm > regionDistanceKm && isLastResort) {
        const distanceMiles = distanceKm * 0.621371;
        const limitMiles = regionDistanceKm * 0.621371;
        warnings?.push({
          severity: 'warning',
          stopIndex,
          stopName: stop.name,
          message: `"${bestVenue.name}" is ${distanceMiles.toFixed(1)} miles away (exceeds ${limitMiles.toFixed(0)} mile radius, but was best match available)`,
        });
      }

      // Warn if venue is at edge of radius (>80% of limit)
      if (warnings && distanceKm > regionDistanceKm * 0.8 && !isLastResort) {
        const distanceMiles = distanceKm * 0.621371;
        const limitMiles = regionDistanceKm * 0.621371;
        warnings.push({
          severity: 'info',
          stopIndex,
          stopName: stop.name,
          message: `"${bestVenue.name}" is ${distanceMiles.toFixed(1)} miles from center (near edge of ${limitMiles.toFixed(0)} mile radius)`,
        });
      }
    }

    // Get detailed information from Google
    const placeDetails = await getGoogleDetails(bestVenue.id);
    const place = placeDetails || (bestVenue.rawData as GooglePlaceNew);

    const enrichedStop: RouteStop = {
      id: uuid.v4() as string,
      name: place.displayName.text,
      type: stop.type!,
      description: stop.description || '',
      address: place.formattedAddress || stop.address!,
      latitude: place.location?.latitude ?? bestVenue.latitude,
      longitude: place.location?.longitude ?? bestVenue.longitude,
      duration: stop.duration || 60,
      order: stop.order || 1,
      venueDetails: mapGooglePlaceToVenueDetails(place),
      validationStatus: 'verified',
    };

    console.log(`[Google] Validated venue: ${enrichedStop.name} (rating: ${enrichedStop.venueDetails?.rating})`);
    return { data: enrichedStop, warnings: warnings || [] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.warn(`[Google Places] Failed to find "${stop.name}":`, errorMsg);
    if (errorStack) {
      console.warn('[Google Places] Error stack:', errorStack);
    }

    // Add to warnings so errors aren't silently swallowed
    if (warnings) {
      warnings.push({
        severity: 'info',
        stopName: stop.name,
        message: `Google Places search unsuccessful: ${errorMsg}`,
      });
    }

    return null;
  }
}

/**
 * Try to find venue using Foursquare API
 */
async function tryFoursquare(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation,
  stopIndex?: number,
  expandedRadius?: number,
  regionDistanceKm?: number,
  warnings?: ValidationWarning[],
  isLastResort?: boolean,
  previousStops?: RouteStop[]
): Promise<RouteValidationResult<RouteStop> | null> {
  try {
    const location = await getSearchCenter(stop, userLocation, previousStops);
    const searchQuery = buildSearchQuery(stop);

    // Strategy 1: Search by name and description
    let venues = await searchFoursquareVenues(
      searchQuery,
      location.latitude,
      location.longitude,
      VALIDATION_CONFIG.INITIAL_RADIUS,
      VALIDATION_CONFIG.SEARCH_LIMIT
    );

    // Strategy 2: Search by type only
    if (venues.length === 0) {
      venues = await searchFoursquareByType(
        stop.type!,
        location.latitude,
        location.longitude,
        VALIDATION_CONFIG.INITIAL_RADIUS,
        VALIDATION_CONFIG.SEARCH_LIMIT
      );
    }

    // Strategy 3: Expand radius (capped at API limit)
    if (venues.length === 0 && expandedRadius) {
      venues = await searchFoursquareByType(
        stop.type!,
        location.latitude,
        location.longitude,
        Math.min(expandedRadius, MAX_GOOGLE_PLACES_RADIUS),
        VALIDATION_CONFIG.SEARCH_LIMIT
      );
    }

    if (venues.length === 0) {
      return null;
    }

    // Normalize Foursquare results for scoring
    // Filter out venues with invalid/missing coordinates
    const normalizedVenues: NormalizedVenue[] = venues
      .filter((v: any) => v.geocodes?.main &&
                          typeof v.geocodes.main.latitude === 'number' &&
                          typeof v.geocodes.main.longitude === 'number' &&
                          !isNaN(v.geocodes.main.latitude) &&
                          !isNaN(v.geocodes.main.longitude))
      .map((v: any) => ({
        id: v.fsq_id,
        name: v.name,
        latitude: v.geocodes.main.latitude,
        longitude: v.geocodes.main.longitude,
        address: v.location?.formatted_address,
        rating: v.rating,
        categories: v.categories?.map((c: any) => c.name),
        provider: 'foursquare' as const,
        rawData: v,
      }));

    if (normalizedVenues.length === 0) {
      console.warn(`[Foursquare] No venues with valid coordinates found for "${stop.name}"`);
      return null;
    }

    const bestVenue = selectBestNormalizedVenue(normalizedVenues, stop, previousStops);

    // Validate distance from user location (enforce radius limit)
    if (userLocation && regionDistanceKm) {
      const distanceKm = calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        bestVenue.latitude,
        bestVenue.longitude
      );

      console.log(`📏 [Foursquare] Venue "${bestVenue.name}" is ${distanceKm.toFixed(2)} km away (limit: ${regionDistanceKm.toFixed(2)} km)`);

      // Hard reject if venue exceeds radius (unless this is last resort)
      if (distanceKm > regionDistanceKm && !isLastResort) {
        console.warn(`❌ [Foursquare] Venue "${bestVenue.name}" exceeds radius limit (${distanceKm.toFixed(1)}km > ${regionDistanceKm.toFixed(1)}km), rejecting`);
        return null; // This will cause fallback to next provider or geocoding
      }

      // On last resort, accept but warn
      if (distanceKm > regionDistanceKm && isLastResort) {
        const distanceMiles = distanceKm * 0.621371;
        const limitMiles = regionDistanceKm * 0.621371;
        warnings?.push({
          severity: 'warning',
          stopIndex,
          stopName: stop.name,
          message: `"${bestVenue.name}" is ${distanceMiles.toFixed(1)} miles away (exceeds ${limitMiles.toFixed(0)} mile radius, but was best match available)`,
        });
      }

      // Warn if venue is at edge of radius (>80% of limit)
      if (warnings && distanceKm > regionDistanceKm * 0.8 && !isLastResort) {
        const distanceMiles = distanceKm * 0.621371;
        const limitMiles = regionDistanceKm * 0.621371;
        warnings.push({
          severity: 'info',
          stopIndex,
          stopName: stop.name,
          message: `"${bestVenue.name}" is ${distanceMiles.toFixed(1)} miles from center (near edge of ${limitMiles.toFixed(0)} mile radius)`,
        });
      }
    }

    // Get detailed information from Foursquare
    const venueDetails = await getFoursquareDetails(bestVenue.id);
    const venue = venueDetails || bestVenue.rawData;

    const mappedDetails = mapFoursquareToDetails(venue);
    // Add provider info
    mappedDetails.provider = 'foursquare';

    const enrichedStop: RouteStop = {
      id: uuid.v4() as string,
      name: venue.name,
      type: stop.type!,
      description: stop.description || '',
      address: venue.location?.formatted_address || stop.address!,
      latitude: venue.geocodes.main.latitude,
      longitude: venue.geocodes.main.longitude,
      duration: stop.duration || 60,
      order: stop.order || 1,
      venueDetails: mappedDetails,
      validationStatus: 'verified',
    };

    console.log(`[Foursquare] Validated venue: ${enrichedStop.name} (rating: ${enrichedStop.venueDetails?.rating})`);
    return { data: enrichedStop, warnings: warnings || [] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.warn(`[Foursquare] Failed to find "${stop.name}":`, errorMsg);
    if (errorStack) {
      console.warn('[Foursquare] Error stack:', errorStack);
    }

    // Add to warnings
    if (warnings) {
      warnings.push({
        severity: 'info',
        stopName: stop.name,
        message: `Foursquare search unsuccessful: ${errorMsg}`,
      });
    }

    return null;
  }
}

/**
 * Select best venue from normalized results with controlled randomness
 */
function selectBestNormalizedVenue(venues: NormalizedVenue[], stop: Partial<RouteStop>, previousStops?: RouteStop[]): NormalizedVenue {
  // Score each venue
  const scoredVenues = venues.map(venue => ({
    venue,
    score: calculateNormalizedVenueScore(venue, stop, previousStops),
    randomizedScore: calculateNormalizedVenueScore(venue, stop, previousStops) + (Math.random() * 20 * VALIDATION_CONFIG.RANDOMNESS_FACTOR),
  }));

  // Filter out venues that are too far or very low rated
  const suitableVenues = scoredVenues.filter(({ venue, score }) => {
    const hasAcceptableRating = !venue.rating || venue.rating >= VALIDATION_CONFIG.MIN_RATING;
    return score > 0 && hasAcceptableRating;
  });

  if (suitableVenues.length === 0) {
    scoredVenues.sort((a, b) => b.score - a.score);
    return scoredVenues[0].venue;
  }

  // Sort by randomized score for selection diversity
  suitableVenues.sort((a, b) => b.randomizedScore - a.randomizedScore);

  // Select from top candidates with weighted random selection
  const topCandidates = suitableVenues.slice(0, Math.min(3, suitableVenues.length));
  const weights = [0.6, 0.3, 0.1];
  const random = Math.random();
  let cumulative = 0;

  for (let i = 0; i < topCandidates.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) {
      return topCandidates[i].venue;
    }
  }

  return topCandidates[0].venue;
}

/**
 * Calculate venue suitability score for normalized venues
 */
function calculateNormalizedVenueScore(venue: NormalizedVenue, stop: Partial<RouteStop>, previousStops?: RouteStop[]): number {
  let score = 0;

  // Name similarity (0-30 points)
  if (stop.name && venue.name) {
    const similarity = calculateNameSimilarity(stop.name, venue.name);
    score += similarity * 30;
  }

  // Description/atmosphere keyword match (0-20 points)
  if (stop.description && venue.name) {
    const descKeywords = extractKeywordsFromText(stop.description);
    const venueText = `${venue.name} ${venue.categories?.join(' ') || ''}`.toLowerCase();
    const matchCount = descKeywords.filter(kw => venueText.includes(kw)).length;
    score += Math.min(matchCount * 5, 20);
  }

  // Global search keywords match (0-15 points)
  if (currentSearchKeywords.length > 0 && venue.name) {
    const venueText = `${venue.name} ${venue.categories?.join(' ') || ''}`.toLowerCase();
    const matchCount = currentSearchKeywords.filter(kw => venueText.includes(kw)).length;
    score += Math.min(matchCount * 5, 15);
  }

  // Category matching (0-15 points)
  if (venue.categories && stop.type) {
    const categoryMatch = venue.categories.some(cat =>
      cat.toLowerCase().includes(stop.type!.toLowerCase())
    );
    if (categoryMatch) {
      score += 15;
    }
  }

  // Rating score (0-15 points)
  if (venue.rating) {
    score += venue.rating * 1.5;
  }

  // Hidden gem bonus (up to 5 points)
  if (venue.rating && venue.rating >= 6 && venue.rating <= 8.5) {
    score += 5;
  }

  // Proximity to previously validated stops (0-25 points)
  if (previousStops && previousStops.length > 0) {
    const distances = previousStops.map(ps =>
      calculateDistanceKm(venue.latitude, venue.longitude, ps.latitude, ps.longitude)
    );
    const avgDistKm = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const minDistKm = Math.min(...distances);

    // Proximity score: full points at 0km, zero at 30km
    const proximityScore = Math.max(0, 1 - avgDistKm / 30) * 20;

    // Nearest stop bonus
    const nearestBonus = minDistKm < 2 ? 5 : minDistKm < 5 ? 3 : 0;

    score += proximityScore + nearestBonus;
  }

  return score;
}

/**
 * Get search center location (use user location if available)
 */
async function getSearchCenter(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation,
  previousStops?: RouteStop[]
): Promise<{ latitude: number; longitude: number }> {
  // Start with user location or geocoded address
  let baseLocation: { latitude: number; longitude: number };

  if (userLocation) {
    baseLocation = userLocation;
  } else {
    try {
      const result = await geocodeAddressWithScore(stop.address!);
      baseLocation = { latitude: result.lat, longitude: result.lon };
    } catch (error) {
      console.warn(`Could not geocode ${stop.address}, using fallback location`);
      baseLocation = { latitude: 39.8283, longitude: -98.5795 };
    }
  }

  // If we have previous stops, shift the search center toward their centroid
  if (previousStops && previousStops.length > 0) {
    const allPoints = [baseLocation, ...previousStops.map(s => ({ latitude: s.latitude, longitude: s.longitude }))];
    const centroid = {
      latitude: allPoints.reduce((sum, p) => sum + p.latitude, 0) / allPoints.length,
      longitude: allPoints.reduce((sum, p) => sum + p.longitude, 0) / allPoints.length,
    };
    return centroid;
  }

  return baseLocation;
}

/**
 * Build search query from stop information
 */
function buildSearchQuery(stop: Partial<RouteStop>): string {
  const parts: string[] = [];

  // Add type
  if (stop.type) {
    parts.push(stop.type);
  }

  // Add name (clean up generic words)
  if (stop.name) {
    const cleanName = stop.name
      .replace(/^(a|an|the)\s+/i, '')
      .replace(/\s+(restaurant|cafe|bar|museum|park|theater)$/i, '');
    if (cleanName.length > 3) {
      parts.push(cleanName);
    }
  }

  // Extract keywords from description
  if (stop.description) {
    const keywords = extractKeywords(stop.description);
    parts.push(...keywords);
  }

  return parts.join(' ').trim();
}

/**
 * Extract relevant keywords from description - comprehensive matching
 */
function extractKeywords(description: string): string[] {
  const keywords: string[] = [];

  // Key descriptive words that help find the right venue
  const patterns = [
    // Atmosphere/vibe
    /\b(romantic|cozy|elegant|casual|upscale|trendy|modern|traditional|authentic|local|intimate|lively|hip|hipster|dive|speakeasy|hidden|secret|quiet|loud|energetic|chill|relaxed|rustic|vintage|retro|artsy|bohemian|quirky|funky|eclectic)\b/gi,
    // Cuisine types
    /\b(italian|french|japanese|chinese|mexican|thai|indian|american|mediterranean|vietnamese|korean|greek|spanish|cuban|brazilian|peruvian|ethiopian|middle.eastern|southern|cajun|creole|tex.mex|fusion)\b/gi,
    // Food/drink types
    /\b(seafood|steak|sushi|pizza|pasta|wine|cocktail|craft.beer|tacos|burgers|bbq|barbecue|ramen|pho|dim.sum|tapas|brunch|breakfast|dessert|ice.cream|coffee|tea|whiskey|bourbon|tequila|mezcal)\b/gi,
    // Location/setting
    /\b(waterfront|downtown|historic|garden|rooftop|outdoor|patio|lakeside|riverside|beachfront|neighborhood|suburban|urban)\b/gi,
    // Features
    /\b(live.music|karaoke|dancing|dj|trivia|games|arcade|bowling|comedy|improv|art|gallery|bookstore|vintage|antique|market)\b/gi,
    // Special qualities
    /\b(hidden.gem|local.favorite|family.owned|mom.and.pop|hole.in.the.wall|off.the.beaten|underrated|iconic|legendary|famous|award.winning)\b/gi,
  ];

  patterns.forEach(pattern => {
    const matches = description.match(pattern);
    if (matches) {
      keywords.push(...matches.map(m => m.toLowerCase().replace(/[._]/g, ' ')));
    }
  });

  return [...new Set(keywords)].slice(0, 5); // Dedupe and limit to top 5 keywords
}

/**
 * Extract keywords from text for matching
 */
function extractKeywordsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  // Filter to meaningful keywords (longer than 3 chars, not common words)
  const stopWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been', 'will', 'would', 'could', 'should', 'their', 'there', 'where', 'when', 'what', 'which', 'about', 'into', 'more', 'some', 'than', 'them', 'then', 'these', 'they', 'very', 'just', 'also', 'only', 'your', 'like', 'make', 'made']);

  return words.filter(word => word.length > 3 && !stopWords.has(word));
}

/**
 * Calculate distance between two coordinates in kilometers using Haversine formula
 */
function calculateDistanceKm(
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
 * Calculate name similarity (simple approach)
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();

  // Exact match
  if (n1 === n2) return 1.0;

  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;

  // Word overlap
  const words1 = new Set(n1.split(/\s+/));
  const words2 = new Set(n2.split(/\s+/));
  const intersection = new Set([...words1].filter(w => words2.has(w)));

  const overlap = intersection.size / Math.max(words1.size, words2.size);
  return overlap;
}

/**
 * Generate a small offset for fallback coordinates to prevent markers from overlapping
 * Each stop gets a unique position in a circle around the center point
 */
function generateFallbackOffset(stopIndex: number, totalStops: number = 7): { latOffset: number; lonOffset: number } {
  // Spread stops in a circle with ~0.01 degree radius (~1km)
  const radius = 0.01;
  const angle = (stopIndex / totalStops) * 2 * Math.PI;
  return {
    latOffset: radius * Math.cos(angle),
    lonOffset: radius * Math.sin(angle),
  };
}

/**
 * Validate stop using geocoding only (fallback)
 */
async function validateStopWithGeocoding(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation,
  stopIndex?: number
): Promise<RouteValidationResult<RouteStop>> {
  // Provide defaults for missing fields instead of throwing
  const name = stop.name || 'Unknown Venue';
  const type = stop.type || 'activity';
  const address = stop.address || (userLocation ? 'Near your location' : 'Address unknown');

  const warnings: ValidationWarning[] = [];
  let location: { latitude: number; longitude: number };
  let resolvedAddress: string = address;
  let validationStatus: 'geocoded' | 'approximated' | 'fallback' = 'fallback';

  try {
    // LAYER 2: Try to geocode with scoring
    const geocodingResult = await geocodeAddressWithScore(address);
    location = { latitude: geocodingResult.lat, longitude: geocodingResult.lon };

    // LAYER 3: Check confidence and region
    if (geocodingResult.confidence < VALIDATION_CONFIG.MIN_CONFIDENCE) {
      const confidenceError = createLowConfidenceError(geocodingResult.confidence, name);
      warnings.push({
        severity: 'warning',
        stopIndex,
        stopName: name,
        message: confidenceError.userMessage,
        suggestedAction: confidenceError.suggestedAction,
      });
      validationStatus = 'approximated';

      // Apply offset for low-confidence results to prevent marker clustering
      const offset = generateFallbackOffset(stopIndex ?? 0);
      location = {
        latitude: location.latitude + offset.latOffset,
        longitude: location.longitude + offset.lonOffset,
      };
      console.log(`📍 Applied offset for low-confidence geocoding (stop ${stopIndex}): final=(${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)})`);
    } else {
      validationStatus = 'geocoded';
    }

    // Validate region
    if (userLocation) {
      const isInRegion = validateCoordinatesInRegion(
        geocodingResult.lat,
        geocodingResult.lon,
        { lat: userLocation.latitude, lon: userLocation.longitude },
        VALIDATION_CONFIG.MAX_REGION_DISTANCE_KM
      );

      if (!isInRegion) {
        const regionError = createRegionMismatchError(name, 'user location');
        warnings.push({
          severity: 'warning',
          stopIndex,
          stopName: name,
          message: regionError.userMessage,
          suggestedAction: regionError.suggestedAction,
        });
      }
    }

    // Reverse geocode to get exact street address
    try {
      // Add delay to respect Nominatim rate limit (1 request/second)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const streetAddress = await reverseGeocode(location.latitude, location.longitude);
      if (streetAddress) {
        console.log(`Reverse geocoded address for "${name}": ${streetAddress}`);
        resolvedAddress = streetAddress;
      }
    } catch (reverseError) {
      console.warn(`Reverse geocoding failed for ${name}, keeping original address`);
      // Keep original address if reverse geocoding fails
    }
  } catch (error) {
    console.warn(`Geocoding failed for ${address}, using fallback location`);
    const classifiedError = classifyError(error);

    warnings.push({
      severity: 'error',
      stopIndex,
      stopName: name,
      message: `Could not locate "${name}". Using fallback location.`,
      suggestedAction: classifiedError.suggestedAction || 'Try a more specific address',
    });

    // Use user location or center of US as fallback, with offset to prevent overlapping
    const baseLocation = userLocation || { latitude: 39.8283, longitude: -98.5795 };
    const offset = generateFallbackOffset(stopIndex ?? 0);
    location = {
      latitude: baseLocation.latitude + offset.latOffset,
      longitude: baseLocation.longitude + offset.lonOffset,
    };
    console.log(`📍 Fallback location for stop ${stopIndex}: base=(${baseLocation.latitude}, ${baseLocation.longitude}), offset=(${offset.latOffset.toFixed(4)}, ${offset.lonOffset.toFixed(4)}), final=(${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)})`);
    validationStatus = 'fallback';

    // Try to reverse geocode the fallback location to get a real address
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const streetAddress = await reverseGeocode(location.latitude, location.longitude);
      if (streetAddress) {
        console.log(`Reverse geocoded fallback address for "${name}": ${streetAddress}`);
        resolvedAddress = streetAddress;
      }
    } catch (reverseError) {
      console.warn(`Reverse geocoding also failed for ${name}, keeping original address`);
    }
  }

  return {
    data: {
      id: uuid.v4() as string,
      name: name,
      type: type,
      description: stop.description || '',
      address: resolvedAddress,
      latitude: location.latitude,
      longitude: location.longitude,
      duration: stop.duration || 60,
      order: stop.order || 1,
      venueDetails: {
        placeId: `geocoded-${name.replace(/\s+/g, '-').toLowerCase()}`,
        provider: 'geocoding',
      },
      validationStatus,
      validationWarnings: warnings.length > 0 ? warnings.map(w => w.message) : undefined,
    },
    warnings,
  };
}

/**
 * Fall back to geocoding for all stops (when Foursquare is not configured)
 */
async function fallbackToGeocoding(
  stops: Partial<RouteStop>[],
  userLocation?: UserLocation
): Promise<RouteValidationResult<RouteStop[]>> {
  const validatedStops: RouteStop[] = [];
  const warnings: ValidationWarning[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    try {
      const result = await validateStopWithGeocoding(stop, userLocation, i);
      validatedStops.push(result.data);
      warnings.push(...result.warnings);
    } catch (error) {
      console.error(`Error geocoding stop ${stop.name}:`, error);
      warnings.push({
        severity: 'error',
        stopIndex: i,
        stopName: stop.name,
        message: `Failed to process "${stop.name}". Skipping this stop.`,
      });
      // Skip this stop if even geocoding fails
      continue;
    }
  }

  return { data: validatedStops, warnings };
}
