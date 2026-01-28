import { RouteStop, UserLocation } from '@/types/route';
import { ValidationWarning, RouteValidationResult } from '@/types/validation';
import {
  searchNearbyVenues,
  searchVenuesByType,
  getPlaceDetails,
  mapVenueToDetails,
  isFoursquareConfigured,
} from './foursquare';
import { geocodeAddressWithScore, reverseGeocode } from './geocoding';
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
 * Validate and enrich route stops with real venue data from Foursquare
 * Now returns validation warnings along with stops
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
  searchKeywords?: string[]
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
      const result = await validateStop(stop, userLocation, i, maxRadiusMeters, maxDistanceKm);
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
  stopIndex?: number,
  maxRadiusMeters?: number,
  maxDistanceKm?: number
): Promise<RouteValidationResult<RouteStop>> {
  const expandedRadius = maxRadiusMeters || VALIDATION_CONFIG.EXPANDED_RADIUS;
  const regionDistanceKm = maxDistanceKm || VALIDATION_CONFIG.MAX_REGION_DISTANCE_KM;
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

  // Strategy 3: If still no results, expand radius (use configured max)
  if (venues.length === 0) {
    console.log(`Still no venues found for ${stop.name}, expanding search radius`);
    venues = await searchWithExpandedRadius(stop, userLocation, expandedRadius);
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
        regionDistanceKm
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
  userLocation?: UserLocation,
  radiusMeters?: number
): Promise<any[]> {
  const location = await getSearchCenter(stop, userLocation);

  return await searchVenuesByType(
    stop.type!,
    location.latitude,
    location.longitude,
    radiusMeters || VALIDATION_CONFIG.EXPANDED_RADIUS,
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
 * Select the best venue from search results with controlled randomness
 */
function selectBestVenue(venues: any[], stop: Partial<RouteStop>): any {
  // Score each venue
  const scoredVenues = venues.map(venue => ({
    venue,
    score: calculateVenueScore(venue, stop),
    // Add controlled randomness to score
    randomizedScore: calculateVenueScore(venue, stop) + (Math.random() * 20 * VALIDATION_CONFIG.RANDOMNESS_FACTOR),
  }));

  // Filter out venues that are too far or very low rated
  const suitableVenues = scoredVenues.filter(({ venue, score }) => {
    const hasAcceptableRating = !venue.rating || venue.rating >= VALIDATION_CONFIG.MIN_RATING;
    return score > 0 && hasAcceptableRating;
  });

  if (suitableVenues.length === 0) {
    // Fall back to best scored venue if none are "suitable"
    scoredVenues.sort((a, b) => b.score - a.score);
    return scoredVenues[0].venue;
  }

  // Sort by randomized score for selection diversity
  suitableVenues.sort((a, b) => b.randomizedScore - a.randomizedScore);

  // Select from top candidates with weighted random selection
  // This allows occasionally picking the 2nd or 3rd best match
  const topCandidates = suitableVenues.slice(0, Math.min(3, suitableVenues.length));
  const weights = [0.6, 0.3, 0.1]; // 60% chance of first, 30% second, 10% third
  const random = Math.random();
  let cumulative = 0;

  for (let i = 0; i < topCandidates.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) {
      console.log(`🎲 Selected venue ${i + 1} of ${topCandidates.length} (score: ${topCandidates[i].score.toFixed(1)})`);
      return topCandidates[i].venue;
    }
  }

  return topCandidates[0].venue;
}

/**
 * Calculate venue suitability score - prioritizes keyword matching over popularity
 */
function calculateVenueScore(venue: any, stop: Partial<RouteStop>): number {
  let score = 0;

  // ============================================
  // KEYWORD MATCHING (most important - up to 50 points)
  // ============================================

  // Name similarity score (0-30 points) - INCREASED from 20
  if (stop.name && venue.name) {
    const similarity = calculateNameSimilarity(stop.name, venue.name);
    score += similarity * 30;
  }

  // Description/atmosphere keyword match (0-20 points) - NEW
  if (stop.description && venue.name) {
    const descKeywords = extractKeywordsFromText(stop.description);
    const venueText = `${venue.name} ${venue.categories?.map((c: any) => c.name).join(' ') || ''}`.toLowerCase();
    const matchCount = descKeywords.filter(kw => venueText.includes(kw)).length;
    score += Math.min(matchCount * 5, 20);
  }

  // Global search keywords match (0-15 points) - NEW
  if (currentSearchKeywords.length > 0 && venue.name) {
    const venueText = `${venue.name} ${venue.categories?.map((c: any) => c.name).join(' ') || ''}`.toLowerCase();
    const matchCount = currentSearchKeywords.filter(kw => venueText.includes(kw)).length;
    score += Math.min(matchCount * 5, 15);
  }

  // ============================================
  // CATEGORY MATCHING (0-15 points)
  // ============================================
  if (venue.categories && stop.type) {
    const categoryMatch = venue.categories.some((cat: any) =>
      cat.name.toLowerCase().includes(stop.type!.toLowerCase())
    );
    if (categoryMatch) {
      score += 15;
    }
  }

  // ============================================
  // QUALITY INDICATORS (reduced importance - up to 25 points)
  // ============================================

  // Rating score (0-15 points, based on 10-point scale) - REDUCED from 40
  if (venue.rating) {
    score += venue.rating * 1.5;
  }

  // Has photos bonus (5 points) - REDUCED from 10
  if (venue.photos && venue.photos.length > 0) {
    score += 5;
  }

  // Verified bonus (5 points) - REDUCED from 10
  if (venue.verified) {
    score += 5;
  }

  // ============================================
  // BONUS: Hidden gem indicator (up to 10 points)
  // ============================================
  // Venues with moderate (not extremely high) ratings but good category match
  // might be hidden gems worth discovering
  if (venue.rating && venue.rating >= 6 && venue.rating <= 8.5) {
    // Moderate rating venues get a small bonus (might be hidden gems)
    score += 5;
  }

  return score;
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
  if (!stop.name || !stop.type || !stop.address) {
    throw new Error('Invalid stop: missing required fields');
  }

  const warnings: ValidationWarning[] = [];
  let location: { latitude: number; longitude: number };
  let resolvedAddress: string = stop.address;
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

    // Reverse geocode to get exact street address
    try {
      // Add delay to respect Nominatim rate limit (1 request/second)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const streetAddress = await reverseGeocode(location.latitude, location.longitude);
      if (streetAddress) {
        console.log(`Reverse geocoded address for "${stop.name}": ${streetAddress}`);
        resolvedAddress = streetAddress;
      }
    } catch (reverseError) {
      console.warn(`Reverse geocoding failed for ${stop.name}, keeping original address`);
      // Keep original address if reverse geocoding fails
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
        console.log(`Reverse geocoded fallback address for "${stop.name}": ${streetAddress}`);
        resolvedAddress = streetAddress;
      }
    } catch (reverseError) {
      console.warn(`Reverse geocoding also failed for ${stop.name}, keeping original address`);
    }
  }

  return {
    data: {
      name: stop.name,
      type: stop.type,
      description: stop.description || '',
      address: resolvedAddress,
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
