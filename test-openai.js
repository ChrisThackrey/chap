// Quick test script for OpenAI integration
require('dotenv').config();
const OpenAI = require('openai').default;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testRouteGeneration() {
  console.log('🧪 Testing OpenAI API connection...\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: [
        {
          role: 'system',
          content: 'You are a date planning expert. Generate a romantic date route with 3 stops.',
        },
        {
          role: 'user',
          content: 'Plan a romantic dinner date in San Francisco',
        },
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
                      enum: ['restaurant', 'cafe', 'bar', 'park', 'museum', 'theater', 'viewpoint', 'activity', 'shopping'],
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

    const route = JSON.parse(response.choices[0].message.content);

    console.log('✅ OpenAI API is working!\n');
    console.log('📍 Generated Route:', route.title);
    console.log('\nStops:');
    route.stops.forEach(stop => {
      console.log(`  ${stop.order}. ${stop.name} (${stop.type})`);
      console.log(`     ${stop.address}`);
      console.log(`     Duration: ${stop.duration} min\n`);
    });

    console.log('🎉 Test successful! Your OpenAI integration is ready.\n');
  } catch (error) {
    console.error('❌ Error testing OpenAI:', error.message);

    if (error.status === 401) {
      console.error('\n⚠️  Invalid API key. Please check your .env file.');
    } else if (error.status === 429) {
      console.error('\n⚠️  Rate limit exceeded. Wait a moment and try again.');
    } else {
      console.error('\n⚠️  Full error:', error);
    }
  }
}

testRouteGeneration();
