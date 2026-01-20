import { openai, MODEL } from './openai';
import { enrichWithRealVenues } from './web-venue-search';
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

  // Live music keywords
  if (lower.match(/live music|live band|concert|jazz|blues|acoustic|musician|performance/i)) {
    keywords['liveMusic'] = ['bar', 'theater', 'activity'];
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
  const hasLiveMusic = 'liveMusic' in venueKeywords;

  const locationPrompt = locationContext
    ? `The user is in ${locationContext}. Plan the date route within this area (60-mile radius).`
    : userLocation
    ? `User is located at ${userLocation.latitude}, ${userLocation.longitude}.`
    : '';

  const liveMusicNote = hasLiveMusic
    ? `\n\nIMPORTANT: The user requested LIVE MUSIC. You MUST include at least one venue that features live music performances, such as a jazz club, music venue, bar with live bands, or concert hall. Set the type to "theater" for music venues.`
    : '';

  const systemPrompt = `You are a date planning expert. Generate a romantic date route with 3-7 stops based on the user's description.

${locationPrompt}${liveMusicNote}

Each stop must include:
- name: Descriptive name for the type of venue (e.g., "Romantic Italian Restaurant", "Cozy Coffee Shop", "Live Jazz Club", "Waterfront Park")
- type: restaurant | cafe | bar | park | museum | theater | viewpoint | activity | shopping
- description: 2-3 sentences describing the ideal characteristics and atmosphere of this venue
- address: Neighborhood or area description (e.g., "downtown", "waterfront district", "historic district")
- duration: Estimated time in minutes
- order: Sequential number (1-based)

VENUE TYPE GUIDELINES:
- "theater" = Live music venues, jazz clubs, concert halls, performance spaces
- "bar" = Cocktail bars, lounges, rooftop bars
- "restaurant" = Dining establishments
- "activity" = River cruises, interactive experiences

Focus on MATCHING THE USER'S REQUEST. If they mention specific activities (live music, outdoor, cultural), ensure those are represented in your stop selection.
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
                  address: { type: 'string' },
                  duration: { type: 'number' },
                  order: { type: 'number' },
                },
                required: ['name', 'type', 'description', 'address', 'duration', 'order'],
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

  // Enrich stops with real San Antonio venue data using web search
  const realVenues = await enrichWithRealVenues(routeData.stops);

  return {
    id: String(uuid.v4()),
    title: routeData.title,
    stops: realVenues,
    createdAt: new Date().toISOString(),
  };
}
