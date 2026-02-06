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
import { Route, RouteStop, UserLocation, VenueCitation, RoutePlan } from '@/types/route';
import { ValidationWarning } from '@/types/validation';
import { containsWebSearchTriggers } from '@/constants/web-search-config';
import { classifyError } from './error-classifier';
import uuid from 'react-native-uuid';

export interface RouteGenerationOptions {
  userLocation?: UserLocation;
  locationContext?: string; // City, state, zip code context
  maxDistanceMiles?: number; // Maximum search radius for stops (1-100 miles)
  venueCount?: number; // Number of stops (2-8, default: 3)
  pinnedStopNames?: string[]; // Names of pre-pinned stops to avoid duplicating
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
 * Check if user prompt explicitly requests multiple venues of same type
 * e.g., "bar crawl", "coffee shop hopping", "visit 3 museums"
 */
function allowsDuplicateTypes(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  // Bar crawl patterns
  if (lower.match(/bar (crawl|hop|hopping)|multiple bars|several bars|\d+ bars/i)) {
    return true;
  }
  // Coffee/cafe patterns
  if (lower.match(/coffee (shop )?hop|multiple (coffee|cafes)|several (coffee|cafes)|\d+ (coffee|cafes)/i)) {
    return true;
  }
  // Museum patterns
  if (lower.match(/museum hop|multiple museums|several museums|\d+ museums/i)) {
    return true;
  }
  return false;
}

/**
 * Validate that all stops have unique venue types
 */
function validateStopTypeUniqueness(stops: Partial<RouteStop>[]): {
  valid: boolean;
  duplicates: string[];
} {
  const typeCounts = new Map<string, number>();

  stops.forEach(stop => {
    if (stop.type) {
      typeCounts.set(stop.type, (typeCounts.get(stop.type) || 0) + 1);
    }
  });

  const duplicates = Array.from(typeCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([type, count]) => `${type} (${count}x)`);

  return {
    valid: duplicates.length === 0,
    duplicates
  };
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
 * Generate route using standard Chat Completions API (fallback)
 */
async function generateRouteWithChatCompletions(
  systemPrompt: string,
  userPrompt: string,
  model: string = MODEL
): Promise<{ routeData: any }> {
  const response = await openai.chat.completions.create({
    model,
    temperature: 0.7,
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

export async function generateRoute(
  prompt: string,
  options?: RouteGenerationOptions
): Promise<RouteGenerationResult> {
  const userLocation = options?.userLocation;
  const locationContext = options?.locationContext;
  const maxDistanceMiles = options?.maxDistanceMiles || 25;
  const venueCount = options?.venueCount || 3;

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

  // Add pinned stops avoidance note
  const pinnedStopNames = options?.pinnedStopNames;
  const pinnedNote = pinnedStopNames && pinnedStopNames.length > 0
    ? `\n\nIMPORTANT: The user has already chosen these specific venues: ${pinnedStopNames.join(', ')}. Do NOT suggest these venues. Generate ${venueCount} ADDITIONAL complementary stops.`
    : '';

  // Add extracted keywords to help with matching
  const keywordsNote = promptKeywords.length > 0
    ? `\n\nKEY TERMS FROM USER REQUEST: ${promptKeywords.join(', ')}
Make sure each venue directly relates to at least one of these terms.`
    : '';

  // Check if user explicitly allows duplicate types (e.g., bar crawl)
  const allowDuplicates = allowsDuplicateTypes(prompt);
  const diversityRule = allowDuplicates
    ? `5. VARIETY in venue types - prioritize diverse experiences while respecting the user's request for multiple similar venues if specified`
    : `5. STRICT NO-DUPLICATE-TYPES RULE:
   - Each stop MUST have a DIFFERENT "type" value. NEVER repeat the same type.
   - Available types: restaurant, cafe, bar, park, museum, theater, viewpoint, activity, shopping
   - Plan the route as a sequence of DISTINCT experiences FIRST (e.g., "dinner → drinks → activity"), then pick one venue per experience.
   - BAD: 2 restaurants (e.g., dinner + dessert both as "restaurant") — REJECTED
   - GOOD: 1 restaurant (dinner) + 1 cafe (dessert) + 1 bar (drinks) — each type used once
   - If the user mentions only food/dining, supplement with complementary experiences (a walk in a park, drinks at a bar, a cafe for dessert) to create a complete outing.`;

  const systemPrompt = `You are a local expert with DEEP knowledge of REAL venues, including hidden gems, neighborhood favorites, and lesser-known spots - not just the popular tourist destinations. Generate a date route with EXACTLY ${venueCount} stops that match what the user is asking for.

${locationPrompt}${intentNotes}${keywordsNote}${pinnedNote}

USER'S REQUEST: "${prompt}"

STEP 1 — PLAN DISTINCT EXPERIENCES:
Before picking venues, decide what ROLE each stop plays in the outing. Each stop must serve a DIFFERENT purpose (e.g., dinner, drinks, dessert, entertainment, a stroll). The user's prompt is the primary guide — build the plan around what they asked for, then fill remaining stops with complementary experiences.

STEP 2 — PICK ONE REAL VENUE PER EXPERIENCE:

CRITICAL RULES:
1. ONLY suggest REAL venues that actually exist - names must be searchable on Google Maps
2. Each venue MUST have a real street address (number, street, city, state, zip)
3. DIRECTLY address what the user asked for - if they want tacos, suggest REAL taco restaurants; if they want craft beer, suggest REAL craft breweries/taprooms
4. GEOGRAPHIC DIVERSITY IS MANDATORY - venues must be spread across different neighborhoods/areas
${diversityRule}
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

  // Helper: run LLM generation with fallback chain
  const runGeneration = async (sysPrompt: string): Promise<{ routeData: any; citations: VenueCitation[]; webSearchUsed: boolean }> => {
    const useWebSearch = shouldTriggerWebSearch(prompt);
    if (useWebSearch) {
      try {
        console.log('[RouteGenerator] Using GPT-4o with web search for hidden gem request');
        const webSearchResult = await generateRouteWithWebSearch(sysPrompt, prompt, locationContext);
        return { routeData: webSearchResult.routeData, citations: webSearchResult.citations, webSearchUsed: webSearchResult.webSearchUsed };
      } catch (webSearchError) {
        const classified = classifyError(webSearchError);
        console.warn('[RouteGenerator] Web search failed, falling back to GPT-4o:', classified.userMessage);
        try {
          console.log('[RouteGenerator] Falling back to GPT-4o Chat Completions');
          const fallbackResult = await generateRouteWithChatCompletions(sysPrompt, prompt, MODEL);
          return { routeData: fallbackResult.routeData, citations: [], webSearchUsed: false };
        } catch (_gpt5Error) {
          console.warn('[RouteGenerator] GPT-4o failed, falling back to GPT-4o');
          const gpt4oResult = await generateRouteWithChatCompletions(sysPrompt, prompt, FALLBACK_MODEL);
          return { routeData: gpt4oResult.routeData, citations: [], webSearchUsed: false };
        }
      }
    } else {
      try {
        const result = await generateRouteWithChatCompletions(sysPrompt, prompt, MODEL);
        return { routeData: result.routeData, citations: [], webSearchUsed: false };
      } catch (_error) {
        console.warn('[RouteGenerator] GPT-4o failed, falling back to GPT-4o');
        const fallbackResult = await generateRouteWithChatCompletions(sysPrompt, prompt, FALLBACK_MODEL);
        return { routeData: fallbackResult.routeData, citations: [], webSearchUsed: false };
      }
    }
  };

  // First attempt
  let genResult = await runGeneration(systemPrompt);
  let { routeData, citations, webSearchUsed } = genResult;

  // Check for duplicate types — retry once with stricter prompt if found
  if (!allowDuplicates) {
    const firstCheck = validateStopTypeUniqueness(routeData.stops);
    if (!firstCheck.valid) {
      console.warn('[RouteGenerator] Duplicate types on first attempt:', firstCheck.duplicates, '— retrying with stricter prompt');
      const usedTypes = routeData.stops.map((s: any) => s.type).join(', ');
      const retryPrompt = systemPrompt + `\n\nRETRY — PREVIOUS ATTEMPT FAILED. You used these types: [${usedTypes}] which contains duplicates: ${firstCheck.duplicates.join(', ')}. You MUST use a DIFFERENT type for each stop. Do NOT repeat any type value.`;
      const retryResult = await runGeneration(retryPrompt);
      const retryCheck = validateStopTypeUniqueness(retryResult.routeData.stops);
      if (retryCheck.valid) {
        console.log('[RouteGenerator] Retry succeeded — no duplicate types');
        routeData = retryResult.routeData;
        citations = retryResult.citations;
        webSearchUsed = retryResult.webSearchUsed;
      } else {
        console.warn('[RouteGenerator] Retry still has duplicates:', retryCheck.duplicates, '— using retry result anyway');
        routeData = retryResult.routeData;
        citations = retryResult.citations;
        webSearchUsed = retryResult.webSearchUsed;
      }
    }
  }

  // Enrich stops with real venue data using dynamic API search
  // Don't pass originalPrompt here — Strategy 0 uses it to search Google with the raw
  // user text, which returns the SAME top result for every stop (causing duplicates).
  // Each stop already has a specific AI-generated name, so Strategies 1-3 handle it.
  const validationResult = await validateAndEnrichStops(
    routeData.stops,
    userLocation,
    maxDistanceMiles,
    promptKeywords,
    undefined
  );

  // Final uniqueness check for warnings
  const uniquenessCheck = validateStopTypeUniqueness(routeData.stops);
  const warnings = [...validationResult.warnings];

  if (!uniquenessCheck.valid && !allowDuplicates) {
    console.warn('[RouteGenerator] Final route still has duplicate venue types:', uniquenessCheck.duplicates);
    warnings.push({
      severity: 'warning',
      message: `Route contains duplicate venue categories: ${uniquenessCheck.duplicates.join(', ')}. Consider regenerating for better variety.`,
      suggestedAction: 'Regenerate the route',
    });
  } else if (!uniquenessCheck.valid && allowDuplicates) {
    console.log('[RouteGenerator] Duplicate types allowed by user request:', uniquenessCheck.duplicates);
  }

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
    warnings,
  };
}

/**
 * Build the JSON schema for route plan generation (search queries, not venues)
 */
function getRoutePlanJsonSchema() {
  return {
    type: 'object' as const,
    properties: {
      title: { type: 'string' as const },
      stops: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            searchQuery: { type: 'string' as const },
            type: {
              type: 'string' as const,
              enum: [
                'restaurant', 'cafe', 'bar', 'park', 'museum',
                'theater', 'viewpoint', 'activity', 'shopping',
              ],
            },
            description: { type: 'string' as const },
            order: { type: 'number' as const },
          },
          required: ['searchQuery', 'type', 'description', 'order'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'stops'],
    additionalProperties: false,
  };
}

/**
 * Generate a route plan with search queries (lightweight — no venue validation).
 * Returns categories/queries that the user can browse via Google Places.
 */
export async function generateRoutePlan(
  prompt: string,
  options?: RouteGenerationOptions
): Promise<RoutePlan> {
  const userLocation = options?.userLocation;
  const locationContext = options?.locationContext;
  const maxDistanceMiles = options?.maxDistanceMiles || 25;
  const venueCount = options?.venueCount || 3;

  const venueKeywords = parsePromptForVenueTypes(prompt);
  const promptKeywords = extractPromptKeywords(prompt);

  const locationPrompt = locationContext
    ? `The user is in ${locationContext}. Search radius: ${maxDistanceMiles} miles.`
    : userLocation
    ? `User is at coordinates ${userLocation.latitude}, ${userLocation.longitude}. Search radius: ${maxDistanceMiles} miles.`
    : '';

  let intentNotes = '';
  if ('dancing' in venueKeywords) intentNotes += '\nThe user wants DANCING — include a nightclub or dance venue query.';
  if ('liveMusic' in venueKeywords) intentNotes += '\nThe user wants LIVE MUSIC — include a live music venue query.';
  if ('views' in venueKeywords) intentNotes += '\nThe user wants VIEWS — include a rooftop or scenic venue query.';
  if ('casual' in venueKeywords) intentNotes += '\nPreference: CASUAL/RELAXED vibes.';
  if ('upscale' in venueKeywords) intentNotes += '\nPreference: UPSCALE experiences.';
  if ('hiddenGem' in venueKeywords) intentNotes += '\nThe user wants HIDDEN GEMS — favor lesser-known spots.';
  if ('unique' in venueKeywords) intentNotes += '\nThe user wants UNIQUE/UNUSUAL venues.';

  const pinnedStopNames = options?.pinnedStopNames;
  const pinnedNote = pinnedStopNames && pinnedStopNames.length > 0
    ? `\nThe user has already chosen: ${pinnedStopNames.join(', ')}. Do NOT duplicate these. Generate ${venueCount} ADDITIONAL complementary stops.`
    : '';

  const keywordsNote = promptKeywords.length > 0
    ? `\nKey terms: ${promptKeywords.join(', ')}`
    : '';

  const allowDuplicates = allowsDuplicateTypes(prompt);
  const diversityNote = allowDuplicates
    ? ''
    : '\nEach stop MUST have a DIFFERENT type. Never repeat the same type.';

  const systemPrompt = `You are a local expert planning an outing. Generate EXACTLY ${venueCount} stop categories as Google Places search queries.

${locationPrompt}${intentNotes}${keywordsNote}${pinnedNote}${diversityNote}

USER REQUEST: "${prompt}"

For each stop, return:
- searchQuery: A specific Google Places text search query that will find great venues matching this category. Include the city/area name. Be specific about cuisine, vibe, or activity type. Example: "upscale Italian restaurant downtown Austin" or "craft cocktail bar with live jazz East Austin".
- type: restaurant | cafe | bar | park | museum | theater | viewpoint | activity | shopping
- description: A short sentence explaining why this stop fits the outing (shown to the user).
- order: Sequential number starting at 1.

The search queries should be specific enough to return relevant Google Places results. Include location context in each query.`;

  const callPlan = async (model: string) => {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'route_plan',
          strict: true,
          schema: getRoutePlanJsonSchema(),
        },
      },
    });
    return JSON.parse(response.choices[0].message.content || '{}');
  };

  let planData: any;
  try {
    planData = await callPlan(MODEL);
  } catch (_err) {
    console.warn('[RouteGenerator] Plan generation failed with primary model, trying fallback');
    planData = await callPlan(FALLBACK_MODEL);
  }

  return {
    title: planData.title || 'Your Route',
    stops: (planData.stops || []).map((s: any, i: number) => ({
      searchQuery: s.searchQuery,
      type: s.type,
      description: s.description,
      order: s.order ?? i + 1,
    })),
  };
}

