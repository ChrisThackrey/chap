import { openai, MODEL } from './openai';
import { validateAndEnrichStops } from './venue-validator';
import { Route, RouteStop, UserLocation } from '@/types/route';
import uuid from 'react-native-uuid';

export async function generateRoute(
  prompt: string,
  userLocation?: UserLocation
): Promise<Route> {
  const locationContext = userLocation
    ? `User is located at ${userLocation.latitude}, ${userLocation.longitude}.`
    : '';

  const systemPrompt = `You are a date planning expert. Generate a romantic date route with 3-7 stops based on the user's description.

${locationContext}

Each stop must include:
- name: Descriptive name for the type of venue (e.g., "Romantic Italian Restaurant", "Cozy Coffee Shop", "Waterfront Park")
- type: restaurant | cafe | bar | park | museum | theater | viewpoint | activity | shopping
- description: 2-3 sentences describing the ideal characteristics and atmosphere of this venue
- address: Neighborhood or area description (e.g., "downtown", "waterfront district", "historic district")
- duration: Estimated time in minutes
- order: Sequential number (1-based)

Focus on the CHARACTERISTICS and ATMOSPHERE rather than specific venue names. Describe what makes the ideal venue special.
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

  // Validate and enrich stops with real venue data
  const validatedStops = await validateAndEnrichStops(routeData.stops, userLocation);

  return {
    id: String(uuid.v4()),
    title: routeData.title,
    stops: validatedStops,
    createdAt: new Date().toISOString(),
  };
}
