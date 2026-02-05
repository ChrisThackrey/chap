import {
  openai,
  MODEL,
  FALLBACK_MODEL,
  WEB_SEARCH_ENABLED,
  WEB_SEARCH_TRIGGER_MODE,
  createResponseWithSearch,
  WebSearchCitation,
} from './openai';
import { validateAndEnrichStops } from './venue-validator';
import { Route, RouteStop, UserLocation, VenueCitation } from '@/types/route';
import { ValidationWarning } from '@/types/validation';
import { containsWebSearchTriggers } from '@/constants/web-search-config';
import { classifyError } from './error-classifier';
import uuid from 'react-native-uuid';

export interface RouteGenerationOptions {
  userLocation?: UserLocation;
  locationContext?: string; // City, state, zip code context
  maxDistanceMiles?: number; // Maximum search radius for stops (1-100 miles)
}

export interface SingleVenueOptions {
  userLocation?: UserLocation;
  locationContext?: string;
  existingStops: RouteStop[];
  maxDistanceMiles?: number;
}

export interface SingleVenueResult {
  stop: RouteStop;
  warnings: ValidationWarning[];
}

export interface RouteGenerationResult {
  route: Route;
  warnings: ValidationWarning[];
}

/**
 * Extract all meaningful keywords from user prompt for venue matching
 */
function extractPromptKeywords(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const keywords: string[] = [];

  // Cuisine types
  const cuisinePatterns = /\b(italian|mexican|thai|chinese|japanese|indian|french|vietnamese|korean|greek|mediterranean|american|bbq|barbecue|seafood|sushi|tacos|pizza|burgers|steakhouse|ramen|pho|dim sum|tapas|farm.to.table)\b/gi;
  const cuisineMatches = lower.match(cuisinePatterns);
  if (cuisineMatches) keywords.push(...cuisineMatches);

  // Atmosphere/vibe keywords
  const vibePatterns = /\b(cozy|intimate|romantic|lively|trendy|hip|hipster|dive|speakeasy|hidden|secret|quiet|loud|energetic|chill|relaxed|casual|upscale|fancy|elegant|rustic|modern|vintage|retro|artsy|bohemian|quirky|funky|eclectic)\b/gi;
  const vibeMatches = lower.match(vibePatterns);
  if (vibeMatches) keywords.push(...vibeMatches);

  // Specific venue features
  const featurePatterns = /\b(rooftop|patio|outdoor|garden|waterfront|lakeside|riverside|ocean.view|skyline|view|live.music|karaoke|dancing|dj|craft.beer|wine.bar|cocktails|happy.hour|brunch|late.night|24.hour|dog.friendly|pet.friendly|family.friendly|instagrammable|photo.worthy)\b/gi;
  const featureMatches = lower.match(featurePatterns);
  if (featureMatches) keywords.push(...featureMatches);

  // Activity types
  const activityPatterns = /\b(arcade|bowling|mini.golf|escape.room|trivia|game|comedy|improv|theater|concert|gallery|museum|bookstore|record.store|vintage|thrift|antique|market|farmers.market)\b/gi;
  const activityMatches = lower.match(activityPatterns);
  if (activityMatches) keywords.push(...activityMatches);

  // Unique/special descriptors
  const uniquePatterns = /\b(hidden.gem|local.favorite|off.the.beaten.path|underrated|lesser.known|neighborhood|hole.in.the.wall|mom.and.pop|family.owned|authentic|traditional|unique|unusual|weird|unconventional)\b/gi;
  const uniqueMatches = lower.match(uniquePatterns);
  if (uniqueMatches) keywords.push(...uniqueMatches);

  return [...new Set(keywords.map(k => k.toLowerCase().replace(/[._]/g, ' ')))];
}

/**
 * Parse user prompt for specific venue requirements
 */
function parsePromptForVenueTypes(prompt: string): Record<string, string[]> {
  const lower = prompt.toLowerCase();
  const keywords: Record<string, string[]> = {};

  // Dancing/Nightlife keywords
  if (lower.match(/danc(e|ing)|nightclub|club|nightlife|dj|disco|salsa|bachata|edm/i)) {
    keywords['dancing'] = ['bar', 'activity', 'theater'];
  }

  // Live music keywords
  if (lower.match(/live music|live band|concert|jazz|blues|acoustic|musician|performance/i)) {
    keywords['liveMusic'] = ['bar', 'theater', 'activity'];
  }

  // Rooftop/Views keywords
  if (lower.match(/rooftop|skyline|view|overlook|sunset|panoramic/i)) {
    keywords['views'] = ['bar', 'viewpoint', 'restaurant'];
  }

  // Casual/Relaxed keywords
  if (lower.match(/casual|relaxed|laid.back|chill|low.key/i)) {
    keywords['casual'] = ['cafe', 'bar', 'park'];
  }

  // Upscale/Fancy keywords
  if (lower.match(/upscale|fancy|elegant|fine.dining|sophisticated|high.end/i)) {
    keywords['upscale'] = ['restaurant', 'bar'];
  }

  // Romantic keywords
  if (lower.match(/romantic|candlelight|intimate|date night|anniversary/i)) {
    keywords['romantic'] = ['restaurant', 'viewpoint', 'activity'];
  }

  // Outdoor keywords
  if (lower.match(/outdoor|outside|park|garden|nature|scenic/i)) {
    keywords['outdoor'] = ['park', 'viewpoint', 'activity'];
  }

  // Cultural keywords
  if (lower.match(/art|culture|museum|gallery|history|heritage/i)) {
    keywords['cultural'] = ['museum', 'theater'];
  }

  // Food and drink keywords
  if (lower.match(/dinner|lunch|breakfast|meal|food|eat/i)) {
    keywords['dining'] = ['restaurant', 'cafe'];
  }

  if (lower.match(/drinks|cocktail|wine|beer|bar/i)) {
    keywords['drinks'] = ['bar', 'restaurant'];
  }

  // Hidden gem / local favorite keywords
  if (lower.match(/hidden.gem|local.favorite|off.the.beaten|underrated|lesser.known|hole.in.the.wall|mom.and.pop/i)) {
    keywords['hiddenGem'] = ['restaurant', 'cafe', 'bar'];
  }

  // Unique/quirky keywords
  if (lower.match(/unique|unusual|weird|quirky|funky|eclectic|unconventional/i)) {
    keywords['unique'] = ['activity', 'bar', 'restaurant'];
  }

  return keywords;
}

/**
 * Determine if web search should be triggered based on prompt and settings
 */
function shouldTriggerWebSearch(prompt: string): boolean {
  if (!WEB_SEARCH_ENABLED) {
    return false;
  }

  switch (WEB_SEARCH_TRIGGER_MODE) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'auto':
    default:
      return containsWebSearchTriggers(prompt);
  }
}

/**
 * Parse location context string into city/region for web search
 */
function parseLocationContext(locationContext?: string): { city?: string; region?: string } {
  if (!locationContext) {
    return {};
  }

  // Try to parse "City, State" or "City, State ZIP" format
  const parts = locationContext.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    return {
      city: parts[0],
      region: parts[1].replace(/\d{5}(-\d{4})?/, '').trim(), // Remove ZIP if present
    };
  }

  return { city: locationContext };
}

/**
 * Convert WebSearchCitation to VenueCitation
 */
function convertCitations(citations: WebSearchCitation[]): VenueCitation[] {
  return citations.map(c => ({
    url: c.url,
    title: c.title,
    startIndex: c.startIndex,
    endIndex: c.endIndex,
  }));
}

/**
 * Build the JSON schema for route generation
 */
function getRouteJsonSchema() {
  return {
    type: 'object' as const,
    properties: {
      title: { type: 'string' as const },
      stops: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const },
            type: {
              type: 'string' as const,
              enum: [
                'restaurant',
                'cafe',
                'bar',
                'park',
                'museum',
                'theater',
                'viewpoint',
                'activity',
                'shopping',
              ],
            },
            description: { type: 'string' as const },
            atmosphereKeywords: {
              type: 'array' as const,
              items: { type: 'string' as const },
            },
            address: { type: 'string' as const },
            approximateDistanceFromCenter: { type: 'number' as const },
            duration: { type: 'number' as const },
            order: { type: 'number' as const },
          },
          required: ['name', 'type', 'description', 'atmosphereKeywords', 'address', 'approximateDistanceFromCenter', 'duration', 'order'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'stops'],
    additionalProperties: false,
  };
}

/**
 * Build the JSON schema for single venue generation
 */
function getSingleVenueJsonSchema() {
  return {
    type: 'object' as const,
    properties: {
      name: { type: 'string' as const },
      type: {
        type: 'string' as const,
        enum: [
          'restaurant',
          'cafe',
          'bar',
          'park',
          'museum',
          'theater',
          'viewpoint',
          'activity',
          'shopping',
        ],
      },
      description: { type: 'string' as const },
      atmosphereKeywords: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      address: { type: 'string' as const },
      duration: { type: 'number' as const },
    },
    required: ['name', 'type', 'description', 'atmosphereKeywords', 'address', 'duration'],
    additionalProperties: false,
  };
}

/**
 * Generate route using Responses API with web search
 */
async function generateRouteWithWebSearch(
  systemPrompt: string,
  userPrompt: string,
  locationContext?: string
): Promise<{ routeData: any; citations: VenueCitation[]; webSearchUsed: boolean }> {
  const parsedLocation = parseLocationContext(locationContext);

  const response = await createResponseWithSearch({
    input: `${systemPrompt}\n\nUser request: ${userPrompt}`,
    locationContext: {
      city: parsedLocation.city,
      region: parsedLocation.region,
      country: 'US',
    },
    enableWebSearch: true,
    jsonSchema: {
      name: 'date_route',
      schema: getRouteJsonSchema(),
    },
  });

  const routeData = JSON.parse(response.outputText || '{}');
  const citations = convertCitations(response.citations);

  return {
    routeData,
    citations,
    webSearchUsed: response.webSearchUsed,
  };
}

/**
 * Generate single venue using Responses API with web search
 */
async function generateSingleVenueWithWebSearch(
  systemPrompt: string,
  userPrompt: string,
  locationContext?: string
): Promise<{ venueData: any; citations: VenueCitation[]; webSearchUsed: boolean }> {
  const parsedLocation = parseLocationContext(locationContext);

  const response = await createResponseWithSearch({
    input: `${systemPrompt}\n\nUser request: ${userPrompt}`,
    locationContext: {
      city: parsedLocation.city,
      region: parsedLocation.region,
      country: 'US',
    },
    enableWebSearch: true,
    jsonSchema: {
      name: 'single_venue',
      schema: getSingleVenueJsonSchema(),
    },
  });

  const venueData = JSON.parse(response.outputText || '{}');
  const citations = convertCitations(response.citations);

  return {
    venueData,
    citations,
    webSearchUsed: response.webSearchUsed,
  };
}

/**
 * Generate route using standard Chat Completions API (fallback)
 */
async function generateRouteWithChatCompletions(
  systemPrompt: string,
  userPrompt: string,
  model: string = MODEL
): Promise<{ routeData: any }> {
  const response = await openai.chat.completions.create({
    model,
    temperature: 0.9,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'date_route',
        strict: true,
        schema: getRouteJsonSchema(),
      },
    },
  });

  const routeData = JSON.parse(response.choices[0].message.content || '{}');
  return { routeData };
}

/**
 * Generate single venue using standard Chat Completions API (fallback)
 */
async function generateSingleVenueWithChatCompletions(
  systemPrompt: string,
  userPrompt: string,
  model: string = MODEL
): Promise<{ venueData: any }> {
  const response = await openai.chat.completions.create({
    model,
    temperature: 0.9,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'single_venue',
        strict: true,
        schema: getSingleVenueJsonSchema(),
      },
    },
  });

  const venueData = JSON.parse(response.choices[0].message.content || '{}');
  return { venueData };
}

export async function generateRoute(
  prompt: string,
  options?: RouteGenerationOptions
): Promise<RouteGenerationResult> {
  const userLocation = options?.userLocation;
  const locationContext = options?.locationContext;
  const maxDistanceMiles = options?.maxDistanceMiles || 25;

  // Parse prompt for specific requirements
  const venueKeywords = parsePromptForVenueTypes(prompt);
  const promptKeywords = extractPromptKeywords(prompt);

  // Build geographic diversity instructions based on radius
  const getGeographicGuidance = (radius: number): string => {
    if (radius <= 10) {
      return `GEOGRAPHIC SPREAD (${radius}-mile radius):
- Select venues from at least 2-3 DIFFERENT neighborhoods
- Include a mix: some within 2-3 miles, others 5-${radius} miles away
- Avoid clustering all venues in the same downtown area`;
    } else if (radius <= 25) {
      return `GEOGRAPHIC SPREAD (${radius}-mile radius):
- Select venues from at least 3-4 DIFFERENT areas/neighborhoods
- Include diverse distances: 1-2 nearby (under 5 miles), 1-2 medium (5-15 miles), 1 farther (15-${radius} miles)
- Consider venues in suburbs or neighboring areas, not just downtown`;
    } else {
      return `GEOGRAPHIC SPREAD (${radius}-mile radius):
- This is a ROAD TRIP route - select venues across MULTIPLE cities/towns
- Include at least 3-4 different cities/areas within the ${radius}-mile radius
- Create a journey that makes geographic sense for driving
- Consider attractions along highways and in different communities`;
    }
  };

  const locationPrompt = locationContext
    ? `The user is in ${locationContext}.
${getGeographicGuidance(maxDistanceMiles)}`
    : userLocation
    ? `User is at coordinates ${userLocation.latitude}, ${userLocation.longitude}.
${getGeographicGuidance(maxDistanceMiles)}`
    : '';

  // Build dynamic intent notes
  let intentNotes = '';

  if ('dancing' in venueKeywords) {
    intentNotes += `\n\nIMPORTANT: The user wants DANCING. Include a nightclub, dance club, or venue with a dance floor and DJ. Use type "bar" or "activity" for dance clubs.`;
  }

  if ('liveMusic' in venueKeywords) {
    intentNotes += `\n\nIMPORTANT: The user requested LIVE MUSIC. Include a live music venue, jazz club, or bar with live bands. Use type "theater" for dedicated music venues.`;
  }

  if ('views' in venueKeywords) {
    intentNotes += `\n\nIMPORTANT: The user wants VIEWS. Include a rooftop bar, observation deck, or scenic overlook. Use type "viewpoint" or "bar" for rooftop venues.`;
  }

  if ('casual' in venueKeywords) {
    intentNotes += `\n\nPREFERENCE: The user prefers CASUAL/RELAXED vibes. Favor laid-back cafes, neighborhood bars, or casual eateries over upscale venues.`;
  }

  if ('upscale' in venueKeywords) {
    intentNotes += `\n\nPREFERENCE: The user wants UPSCALE experiences. Favor fine dining, elegant cocktail bars, and sophisticated venues.`;
  }

  if ('hiddenGem' in venueKeywords) {
    intentNotes += `\n\nIMPORTANT: The user wants HIDDEN GEMS and LOCAL FAVORITES. Prioritize lesser-known, neighborhood spots over popular tourist destinations. Look for family-owned, hole-in-the-wall, or off-the-beaten-path venues that locals love but tourists might miss.`;
  }

  if ('unique' in venueKeywords) {
    intentNotes += `\n\nIMPORTANT: The user wants UNIQUE/UNUSUAL venues. Prioritize quirky, unconventional, or one-of-a-kind spots. Avoid generic chain restaurants or typical tourist spots.`;
  }

  // Add extracted keywords to help with matching
  const keywordsNote = promptKeywords.length > 0
    ? `\n\nKEY TERMS FROM USER REQUEST: ${promptKeywords.join(', ')}
Make sure each venue directly relates to at least one of these terms.`
    : '';

  const systemPrompt = `You are a local expert with DEEP knowledge of REAL venues, including hidden gems, neighborhood favorites, and lesser-known spots - not just the popular tourist destinations. Generate a date route with 3-5 stops that EXACTLY matches what the user is asking for.

${locationPrompt}${intentNotes}${keywordsNote}

USER'S REQUEST: "${prompt}"

CRITICAL RULES:
1. ONLY suggest REAL venues that actually exist - names must be searchable on Google Maps
2. Each venue MUST have a real street address (number, street, city, state, zip)
3. DIRECTLY address what the user asked for - if they want tacos, suggest REAL taco restaurants; if they want craft beer, suggest REAL craft breweries/taprooms
4. GEOGRAPHIC DIVERSITY IS MANDATORY - venues must be spread across different neighborhoods/areas
5. VARIETY in venue types - don't suggest 3 similar bars or 3 similar restaurants
6. Mix popularity levels - include some well-known spots AND some hidden gems/local favorites

Each stop must include:
- name: The EXACT real name of the venue (be specific, not generic)
- type: restaurant | cafe | bar | park | museum | theater | viewpoint | activity | shopping
- description: Why this specific venue matches what the user wants (mention specific features)
- atmosphereKeywords: 2-4 keywords for the vibe
- address: FULL street address with number
- approximateDistanceFromCenter: estimated miles from center point (to ensure geographic diversity)
- duration: Time in minutes
- order: Sequential number

VENUE SELECTION STRATEGY:
- Prioritize venues that SPECIFICALLY match the user's request over generally popular places
- Include at least one "hidden gem" or "local favorite" that tourists might not know
- Spread across different parts of the city/region (check approximateDistanceFromCenter values)
- Create a logical route that flows geographically
- Don't default to the same well-known spots every time - be creative and specific to the request`;

  // Determine whether to use web search
  const useWebSearch = shouldTriggerWebSearch(prompt);
  let routeData: any;
  let citations: VenueCitation[] = [];
  let webSearchUsed = false;

  if (useWebSearch) {
    // Try web search first, then fall back to standard generation
    try {
      console.log('[RouteGenerator] Using GPT-4o with web search for hidden gem request');
      const webSearchResult = await generateRouteWithWebSearch(
        systemPrompt,
        prompt,
        locationContext
      );
      routeData = webSearchResult.routeData;
      citations = webSearchResult.citations;
      webSearchUsed = webSearchResult.webSearchUsed;
    } catch (webSearchError) {
      // Classify and log the error
      const classified = classifyError(webSearchError);
      console.warn('[RouteGenerator] Web search failed, falling back to GPT-4o:', classified.userMessage);

      try {
        // Fallback 1: GPT-4o without web search (Chat Completions)
        console.log('[RouteGenerator] Falling back to GPT-4o Chat Completions');
        const fallbackResult = await generateRouteWithChatCompletions(systemPrompt, prompt, MODEL);
        routeData = fallbackResult.routeData;
      } catch (_gpt5Error) {
        // Fallback 2: GPT-4o as last resort
        console.warn('[RouteGenerator] GPT-4o failed, falling back to GPT-4o');
        const gpt4oResult = await generateRouteWithChatCompletions(systemPrompt, prompt, FALLBACK_MODEL);
        routeData = gpt4oResult.routeData;
      }
    }
  } else {
    // Standard generation with GPT-4o (Chat Completions)
    try {
      const result = await generateRouteWithChatCompletions(systemPrompt, prompt, MODEL);
      routeData = result.routeData;
    } catch (_error) {
      // Fallback to GPT-4o
      console.warn('[RouteGenerator] GPT-4o failed, falling back to GPT-4o');
      const fallbackResult = await generateRouteWithChatCompletions(systemPrompt, prompt, FALLBACK_MODEL);
      routeData = fallbackResult.routeData;
    }
  }

  // Enrich stops with real venue data using dynamic Foursquare API search
  // Pass the extracted keywords for better matching
  const validationResult = await validateAndEnrichStops(
    routeData.stops,
    userLocation,
    maxDistanceMiles,
    promptKeywords
  );

  // Add web search metadata to stops if citations were found
  const enrichedStops = validationResult.data.map((stop) => ({
    ...stop,
    webSearchUsed,
    citations: webSearchUsed ? citations : undefined,
  }));

  const route: Route = {
    id: String(uuid.v4()),
    title: routeData.title,
    stops: enrichedStops,
    createdAt: new Date().toISOString(),
  };

  return {
    route,
    warnings: validationResult.warnings,
  };
}

/**
 * Generate a single venue based on a description prompt
 * Used for adding stops to an existing route
 */
export async function generateSingleVenue(
  prompt: string,
  options: SingleVenueOptions
): Promise<SingleVenueResult> {
  console.log('[generateSingleVenue] Starting with prompt:', prompt);
  const { userLocation, locationContext, existingStops, maxDistanceMiles = 25 } = options;
  console.log('[generateSingleVenue] Location context:', locationContext);
  console.log('[generateSingleVenue] User location:', userLocation);
  console.log('[generateSingleVenue] Existing stops:', existingStops.length);

  // Build list of existing stop names to avoid duplicates
  const existingNames = existingStops.map((s) => s.name).join(', ');

  const locationPrompt = locationContext
    ? `The user is in ${locationContext}. Search within ${maxDistanceMiles} miles.`
    : userLocation
    ? `User is at coordinates ${userLocation.latitude}, ${userLocation.longitude}. Search within ${maxDistanceMiles} miles.`
    : '';

  // Extract keywords from the prompt for better matching
  const promptKeywords = extractPromptKeywords(prompt);
  const keywordsNote = promptKeywords.length > 0
    ? `\nKEY TERMS TO MATCH: ${promptKeywords.join(', ')}`
    : '';

  const systemPrompt = `You are a local expert finding REAL venues, including hidden gems and local favorites. Find ONE specific venue that matches the user's request.

${locationPrompt}

EXISTING STOPS (do NOT suggest duplicates): ${existingNames || 'None'}

USER'S REQUEST: "${prompt}"${keywordsNote}

CRITICAL RULES:
1. Suggest exactly ONE real venue that actually exists and is searchable on Google Maps
2. The venue MUST have a real street address (number, street, city, state, zip)
3. Do NOT suggest any venue already in the existing stops list
4. PRIORITIZE venues that specifically match what the user asked for over generally popular places
5. Consider hidden gems and local favorites, not just tourist spots

Return the venue with:
- name: The EXACT real name of the venue
- type: restaurant | cafe | bar | park | museum | theater | viewpoint | activity | shopping
- description: Why this venue matches what the user wants (be specific about matching features)
- atmosphereKeywords: 2-4 keywords for the vibe
- address: FULL street address with number
- duration: Time in minutes (suggest appropriate duration for venue type)`;

  // Determine whether to use web search
  const useWebSearch = shouldTriggerWebSearch(prompt);
  console.log('[generateSingleVenue] Use web search:', useWebSearch);
  let venueData: any;
  let citations: VenueCitation[] = [];
  let webSearchUsed = false;

  if (useWebSearch) {
    // Try web search first, then fall back to standard generation
    try {
      console.log('[generateSingleVenue] Using GPT-4o with web search for single venue');
      const webSearchResult = await generateSingleVenueWithWebSearch(
        systemPrompt,
        prompt,
        locationContext
      );
      venueData = webSearchResult.venueData;
      citations = webSearchResult.citations;
      webSearchUsed = webSearchResult.webSearchUsed;
    } catch (webSearchError) {
      // Classify and log the error
      const classified = classifyError(webSearchError);
      console.warn('[generateSingleVenue] Web search failed:', classified.userMessage);
      console.warn('[generateSingleVenue] Full web search error:', webSearchError);

      try {
        // Fallback 1: GPT-4o without web search (Chat Completions)
        console.log('[generateSingleVenue] Falling back to GPT-4o Chat Completions');
        const fallbackResult = await generateSingleVenueWithChatCompletions(systemPrompt, prompt, MODEL);
        venueData = fallbackResult.venueData;
        console.log('[generateSingleVenue] Fallback to GPT-4o returned venue:', venueData?.name);
      } catch (gpt4oError) {
        // Fallback 2: GPT-4o-mini as last resort
        console.warn('[generateSingleVenue] GPT-4o also failed:', gpt4oError instanceof Error ? gpt4oError.message : gpt4oError);
        console.log('[generateSingleVenue] Falling back to GPT-4o-mini');
        const gpt4oMiniResult = await generateSingleVenueWithChatCompletions(systemPrompt, prompt, FALLBACK_MODEL);
        venueData = gpt4oMiniResult.venueData;
        console.log('[generateSingleVenue] GPT-4o-mini returned venue:', venueData?.name);
      }
    }
  } else {
    // Standard generation with GPT-4o (Chat Completions)
    try {
      console.log('[generateSingleVenue] Using standard GPT-4o Chat Completions');
      const result = await generateSingleVenueWithChatCompletions(systemPrompt, prompt, MODEL);
      venueData = result.venueData;
      console.log('[generateSingleVenue] GPT-4o returned venue:', venueData?.name);
    } catch (apiError) {
      // Fallback to GPT-4o
      console.warn('[generateSingleVenue] GPT-4o failed:', apiError instanceof Error ? apiError.message : apiError);
      console.warn('[generateSingleVenue] Falling back to GPT-4o-mini');
      const fallbackResult = await generateSingleVenueWithChatCompletions(systemPrompt, prompt, FALLBACK_MODEL);
      venueData = fallbackResult.venueData;
      console.log('[generateSingleVenue] Fallback returned venue:', venueData?.name);
    }
  }

  // Validate and enrich the single stop (order will be set by caller)
  console.log('[generateSingleVenue] Validating venue data:', JSON.stringify(venueData, null, 2));

  // Ensure required fields are present
  if (!venueData || !venueData.name) {
    console.error('[generateSingleVenue] AI returned invalid venue data - missing name');
    throw new Error('Could not generate a valid venue. Please try a different description.');
  }

  // Provide defaults for missing fields
  const stopData = {
    name: venueData.name,
    type: venueData.type || 'activity',
    description: venueData.description || `A ${venueData.type || 'venue'} matching your request`,
    address: venueData.address || (locationContext ? `${locationContext}` : 'Address to be determined'),
    atmosphereKeywords: venueData.atmosphereKeywords || [],
    duration: venueData.duration || 60,
    order: 1, // Temporary order, will be updated by caller
  };

  console.log('[generateSingleVenue] Prepared stop data:', JSON.stringify(stopData, null, 2));
  console.log('[generateSingleVenue] Calling validateAndEnrichStops...');

  // Pass promptKeywords for consistent venue matching with generateRoute
  let validationResult;
  try {
    validationResult = await validateAndEnrichStops([stopData], userLocation, maxDistanceMiles, promptKeywords);
    console.log('[generateSingleVenue] Validation returned', validationResult.data.length, 'stops');
  } catch (validationError) {
    console.error('[generateSingleVenue] Validation threw error:', validationError);
    const errorMsg = validationError instanceof Error ? validationError.message : 'Validation failed';
    throw new Error(`Could not validate venue: ${errorMsg}`);
  }

  if (validationResult.data.length === 0) {
    console.error('[generateSingleVenue] No valid venue found after validation');
    const radiusMsg = maxDistanceMiles ? ` within ${maxDistanceMiles} miles` : '';
    throw new Error(`Could not find a venue matching "${prompt}"${radiusMsg}. Try a different description or increase your search radius.`);
  }

  // Add web search metadata to the stop
  const enrichedStop = {
    ...validationResult.data[0],
    webSearchUsed,
    citations: webSearchUsed ? citations : undefined,
  };

  return {
    stop: enrichedStop,
    warnings: validationResult.warnings,
  };
}
