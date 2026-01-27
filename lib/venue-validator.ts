import { RouteStop, UserLocation } from '@/types/route';
import { ValidationWarning, RouteValidationResult } from '@/types/validation';
import {
  searchNearbyVenues,
  searchVenuesByType,
  getPlaceDetails,
  mapVenueToDetails,
  isFoursquareConfigured,
} from './foursquare';
import { geocodeAddressWithScore } from './geocoding';
import { validateAddressQuality } from './address-validator';
import {
  classifyError,
  shouldFailFast,
  createLowConfidenceError,
  createRegionMismatchError,
} from './error-classifier';
import { validateCoordinatesInRegion } from './geocoding-scorer';

/**
 * Validation configuration
 */
const VALIDATION_CONFIG = {
  INITIAL_RADIUS: 16093, // 10 miles initial search radius (in meters)
  EXPANDED_RADIUS: 96561, // 60 miles fallback radius (in meters)
  MIN_RATING: 7.0, // Prefer venues with rating >= 7.0
  MAX_DISTANCE_KM: 96.5, // Maximum acceptable distance from location (60 miles)
  SEARCH_LIMIT: 20, // Number of results to fetch per search (increased for wider area)
  MIN_CONFIDENCE: 0.5, // Minimum geocoding confidence to accept without warning
  MAX_REGION_DISTANCE_KM: 100, // Maximum distance from user location for region validation
};

/**
 * Validate and enrich route stops with real venue data from Foursquare
 * Now returns validation warnings along with stops
 *
 * @param stops - Array of AI-generated stops
 * @param userLocation - Optional user location for context
 * @returns Object containing validated stops and validation warnings
 */
export async function validateAndEnrichStops(
  stops: Partial<RouteStop>[],
  userLocation?: UserLocation
): Promise<RouteValidationResult<RouteStop[]>> {
  const warnings: ValidationWarning[] = [];

  // If Foursquare is not configured or unavailable (410), fall back to geocoding only
  if (!isFoursquareConfigured()) {
    console.warn('Foursquare API not available, using geocoding only');
    warnings.push({
      severity: 'info',
      message: 'Using geocoding for venue locations.',
      suggestedAction: 'Configure a valid Foursquare API key for verified venue data',
    });
    const geocodedStops = await fallbackToGeocoding(stops, userLocation);
    warnings.push(...geocodedStops.warnings);
    return { data: geocodedStops.data, warnings };
  }

  const validatedStops: RouteStop[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    try {
      const result = await validateStop(stop, userLocation, i);
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
 * Validate a single stop and enrich with venue data
 */
async function validateStop(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation,
  stopIndex?: number
): Promise<RouteValidationResult<RouteStop>> {
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

  // Strategy 1: Search by name and description near the user location
  let venues = await searchByNameAndDescription(stop, userLocation);

  // Strategy 2: If no results, search by type only
  if (venues.length === 0) {
    console.log(`No venues found for ${stop.name}, trying type-only search`);
    venues = await searchByTypeOnly(stop, userLocation);
  }

  // Strategy 3: If still no results, expand radius
  if (venues.length === 0) {
    console.log(`Still no venues found for ${stop.name}, expanding search radius`);
    venues = await searchWithExpandedRadius(stop, userLocation);
  }

  // Select best venue from results
  if (venues.length > 0) {
    const bestVenue = selectBestVenue(venues, stop);

    // LAYER 3: Validate coordinates in expected region
    if (userLocation) {
      const isInRegion = validateCoordinatesInRegion(
        bestVenue.geocodes.main.latitude,
        bestVenue.geocodes.main.longitude,
        { lat: userLocation.latitude, lon: userLocation.longitude },
        VALIDATION_CONFIG.MAX_REGION_DISTANCE_KM
      );

      if (!isInRegion) {
        const regionError = createRegionMismatchError(stop.name!, 'user location');
        warnings.push({
          severity: 'warning',
          stopIndex,
          stopName: stop.name,
          message: regionError.userMessage,
          suggestedAction: regionError.suggestedAction,
        });
      }
    }

    // Fetch detailed information
    const venueDetails = await getPlaceDetails(bestVenue.fsq_id);

    if (venueDetails) {
      const enrichedStop: RouteStop = {
        name: venueDetails.name,
        type: stop.type,
        description: stop.description || '',
        address: venueDetails.location.formatted_address || stop.address,
        latitude: venueDetails.geocodes.main.latitude,
        longitude: venueDetails.geocodes.main.longitude,
        duration: stop.duration || 60,
        order: stop.order || 1,
        venueDetails: mapVenueToDetails(venueDetails),
        validationStatus: 'verified',
      };

      console.log(`✓ Validated venue: ${enrichedStop.name} (rating: ${enrichedStop.venueDetails?.rating})`);
      return { data: enrichedStop, warnings };
    }
  }

  // Fallback: Use AI suggestion with geocoding
  console.log(`No suitable venue found for ${stop.name}, using AI suggestion`);
  return await validateStopWithGeocoding(stop, userLocation, stopIndex);
}

/**
 * Get search center location (use user location if available)
 */
async function getSearchCenter(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation
): Promise<{ latitude: number; longitude: number }> {
  // Prefer user location if available
  if (userLocation) {
    return userLocation;
  }

  // Fall back to geocoding the address
  try {
    const result = await geocodeAddressWithScore(stop.address!);
    return { latitude: result.lat, longitude: result.lon };
  } catch (error) {
    console.warn(`Could not geocode ${stop.address}, using fallback location`);
    // Default to center of US if no user location
    return { latitude: 39.8283, longitude: -98.5795 };
  }
}

/**
 * Search venues by name and description
 */
async function searchByNameAndDescription(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation
): Promise<any[]> {
  // Get search center location
  const location = await getSearchCenter(stop, userLocation);

  // Build search query from name and description
  const searchQuery = buildSearchQuery(stop);

  // Search nearby venues
  return await searchNearbyVenues(
    searchQuery,
    location.latitude,
    location.longitude,
    VALIDATION_CONFIG.INITIAL_RADIUS,
    VALIDATION_CONFIG.SEARCH_LIMIT
  );
}

/**
 * Search venues by type only (more general search)
 */
async function searchByTypeOnly(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation
): Promise<any[]> {
  const location = await getSearchCenter(stop, userLocation);

  return await searchVenuesByType(
    stop.type!,
    location.latitude,
    location.longitude,
    VALIDATION_CONFIG.INITIAL_RADIUS,
    VALIDATION_CONFIG.SEARCH_LIMIT
  );
}

/**
 * Search with expanded radius as last resort
 */
async function searchWithExpandedRadius(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation
): Promise<any[]> {
  const location = await getSearchCenter(stop, userLocation);

  return await searchVenuesByType(
    stop.type!,
    location.latitude,
    location.longitude,
    VALIDATION_CONFIG.EXPANDED_RADIUS,
    VALIDATION_CONFIG.SEARCH_LIMIT
  );
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
 * Extract relevant keywords from description
 */
function extractKeywords(description: string): string[] {
  const keywords: string[] = [];

  // Key descriptive words that help find the right venue
  const patterns = [
    /\b(romantic|cozy|elegant|casual|upscale|trendy|modern|traditional|authentic|local)\b/gi,
    /\b(italian|french|japanese|chinese|mexican|thai|indian|american|mediterranean)\b/gi,
    /\b(seafood|steak|sushi|pizza|pasta|wine|cocktail|craft beer)\b/gi,
    /\b(waterfront|downtown|historic|garden|rooftop|outdoor)\b/gi,
  ];

  patterns.forEach(pattern => {
    const matches = description.match(pattern);
    if (matches) {
      keywords.push(...matches.map(m => m.toLowerCase()));
    }
  });

  return keywords.slice(0, 3); // Limit to top 3 keywords
}

/**
 * Select the best venue from search results
 */
function selectBestVenue(venues: any[], stop: Partial<RouteStop>): any {
  // Score each venue
  const scoredVenues = venues.map(venue => ({
    venue,
    score: calculateVenueScore(venue, stop),
  }));

  // Sort by score (highest first)
  scoredVenues.sort((a, b) => b.score - a.score);

  // Filter out venues that are too far or low rated
  const suitableVenues = scoredVenues.filter(({ venue, score }) => {
    const hasGoodRating = !venue.rating || venue.rating >= VALIDATION_CONFIG.MIN_RATING;
    return score > 0 && hasGoodRating;
  });

  // Return best venue, or first venue if none are suitable
  return suitableVenues.length > 0
    ? suitableVenues[0].venue
    : scoredVenues[0].venue;
}

/**
 * Calculate venue suitability score
 */
function calculateVenueScore(venue: any, stop: Partial<RouteStop>): number {
  let score = 0;

  // Rating score (0-40 points, based on 10-point scale)
  if (venue.rating) {
    score += venue.rating * 4;
  }

  // Name similarity score (0-20 points)
  if (stop.name && venue.name) {
    const similarity = calculateNameSimilarity(stop.name, venue.name);
    score += similarity * 20;
  }

  // Verified bonus (10 points)
  if (venue.verified) {
    score += 10;
  }

  // Has photos bonus (10 points)
  if (venue.photos && venue.photos.length > 0) {
    score += 10;
  }

  // Open now bonus (10 points)
  if (venue.hours?.is_open_now) {
    score += 10;
  }

  // Category match bonus (10 points)
  if (venue.categories && stop.type) {
    const categoryMatch = venue.categories.some((cat: any) =>
      cat.name.toLowerCase().includes(stop.type!.toLowerCase())
    );
    if (categoryMatch) {
      score += 10;
    }
  }

  return score;
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
 * Validate stop using geocoding only (fallback)
 */
async function validateStopWithGeocoding(
  stop: Partial<RouteStop>,
  userLocation?: UserLocation,
  stopIndex?: number
): Promise<RouteValidationResult<RouteStop>> {
  if (!stop.name || !stop.type || !stop.address) {
    throw new Error('Invalid stop: missing required fields');
  }

  const warnings: ValidationWarning[] = [];
  let location: { latitude: number; longitude: number };
  let validationStatus: 'geocoded' | 'approximated' | 'fallback' = 'fallback';

  try {
    // LAYER 2: Try to geocode with scoring
    const geocodingResult = await geocodeAddressWithScore(stop.address);
    location = { latitude: geocodingResult.lat, longitude: geocodingResult.lon };

    // LAYER 3: Check confidence and region
    if (geocodingResult.confidence < VALIDATION_CONFIG.MIN_CONFIDENCE) {
      const confidenceError = createLowConfidenceError(geocodingResult.confidence, stop.name);
      warnings.push({
        severity: 'warning',
        stopIndex,
        stopName: stop.name,
        message: confidenceError.userMessage,
        suggestedAction: confidenceError.suggestedAction,
      });
      validationStatus = 'approximated';
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
        const regionError = createRegionMismatchError(stop.name!, 'user location');
        warnings.push({
          severity: 'warning',
          stopIndex,
          stopName: stop.name,
          message: regionError.userMessage,
          suggestedAction: regionError.suggestedAction,
        });
      }
    }
  } catch (error) {
    console.warn(`Geocoding failed for ${stop.address}, using fallback location`);
    const classifiedError = classifyError(error);

    warnings.push({
      severity: 'error',
      stopIndex,
      stopName: stop.name,
      message: `Could not locate "${stop.name}". Using fallback location.`,
      suggestedAction: classifiedError.suggestedAction || 'Try a more specific address',
    });

    // Use user location or center of US as fallback
    location = userLocation || { latitude: 39.8283, longitude: -98.5795 };
    validationStatus = 'fallback';
  }

  return {
    data: {
      name: stop.name,
      type: stop.type,
      description: stop.description || '',
      address: stop.address,
      latitude: location.latitude,
      longitude: location.longitude,
      duration: stop.duration || 60,
      order: stop.order || 1,
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
