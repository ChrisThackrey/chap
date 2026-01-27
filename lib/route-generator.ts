import { openai, MODEL } from './openai';
import { validateAndEnrichStops } from './venue-validator';
import { Route, RouteStop, UserLocation } from '@/types/route';
import uuid from 'react-native-uuid';

export interface RouteGenerationOptions {
  userLocation?: UserLocation;
  locationContext?: string; // City, state, zip code context
}

/**
 * Parse user prompt for specific venue requirements
 */
function parsePromptForVenueTypes(prompt: string): Record<string, string[]> {
  const lower = prompt.toLowerCase();
  const keywords: Record<string, string[]> = {};

  // Dancing/Nightlife keywords (NEW)
  if (lower.match(/danc(e|ing)|nightclub|club|nightlife|dj|disco|salsa|bachata|edm/i)) {
    keywords['dancing'] = ['bar', 'activity', 'theater'];
  }

  // Live music keywords
  if (lower.match(/live music|live band|concert|jazz|blues|acoustic|musician|performance/i)) {
    keywords['liveMusic'] = ['bar', 'theater', 'activity'];
  }

  // Rooftop/Views keywords (NEW)
  if (lower.match(/rooftop|skyline|view|overlook|sunset|panoramic/i)) {
    keywords['views'] = ['bar', 'viewpoint', 'restaurant'];
  }

  // Casual/Relaxed keywords (NEW)
  if (lower.match(/casual|relaxed|laid.back|chill|low.key/i)) {
    keywords['casual'] = ['cafe', 'bar', 'park'];
  }

  // Upscale/Fancy keywords (NEW)
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

  return keywords;
}

export async function generateRoute(
  prompt: string,
  options?: RouteGenerationOptions
): Promise<Route> {
  const userLocation = options?.userLocation;
  const locationContext = options?.locationContext;

  // Parse prompt for specific requirements
  const venueKeywords = parsePromptForVenueTypes(prompt);

  const locationPrompt = locationContext
    ? `The user is in ${locationContext}. Plan the date route within this area (60-mile radius).`
    : userLocation
    ? `User is located at ${userLocation.latitude}, ${userLocation.longitude}.`
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

  const systemPrompt = `You are a date planning expert. Generate a romantic date route with 3-7 stops based on the user's description.

${locationPrompt}${intentNotes}

Each stop must include:
- name: SPECIFIC and DESCRIPTIVE name that reflects the venue's key characteristic (e.g., "Rooftop Cocktail Bar with Skyline Views", "Intimate Jazz Club with Live Bands", "Nightclub with DJ and Dance Floor")
- type: restaurant | cafe | bar | park | museum | theater | viewpoint | activity | shopping
- description: 2-3 sentences describing the SPECIFIC characteristics that match the user's request. Include keywords like "dance floor", "rooftop", "live jazz", "waterfront", etc.
- atmosphereKeywords: Array of 2-4 keywords describing the vibe (e.g., ["dancing", "nightlife", "energetic"], ["rooftop", "views", "romantic"], ["jazz", "intimate", "live music"])
- address: Neighborhood or area description
- duration: Estimated time in minutes
- order: Sequential number (1-based)

VENUE TYPE GUIDELINES:
- "theater" = Live music venues, jazz clubs, concert halls (NOT dance clubs)
- "bar" = Cocktail bars, lounges, rooftop bars, dance clubs, nightclubs
- "activity" = Dance clubs, river cruises, interactive experiences
- "restaurant" = Dining establishments
- "viewpoint" = Observation decks, scenic overlooks, rooftop venues with views

CRITICAL REQUIREMENT:
If the user mentions a SPECIFIC activity (dancing, live music, rooftop, sunset, etc.), you MUST include at least one venue that explicitly provides that experience. Be specific in your descriptions - don't use generic terms.

Consider flow, timing, variety, and geographic proximity. Ensure realistic timing and that stops are geographically logical.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'date_route',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            stops: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: {
                    type: 'string',
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
                  description: { type: 'string' },
                  atmosphereKeywords: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  address: { type: 'string' },
                  duration: { type: 'number' },
                  order: { type: 'number' },
                },
                required: ['name', 'type', 'description', 'atmosphereKeywords', 'address', 'duration', 'order'],
                additionalProperties: false,
              },
            },
          },
          required: ['title', 'stops'],
          additionalProperties: false,
        },
      },
    },
  });

  const routeData = JSON.parse(response.choices[0].message.content || '{}');

  // Enrich stops with real venue data using dynamic Foursquare API search
  const realVenues = await validateAndEnrichStops(routeData.stops, userLocation);

  return {
    id: String(uuid.v4()),
    title: routeData.title,
    stops: realVenues,
    createdAt: new Date().toISOString(),
  };
}
