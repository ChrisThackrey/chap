import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Required for React Native/Expo environment
});

export const MODEL = 'gpt-4o';
export const FALLBACK_MODEL = 'gpt-4o-mini';

// Web search configuration from environment
export const WEB_SEARCH_ENABLED = process.env.EXPO_PUBLIC_ENABLE_WEB_SEARCH !== 'false';
export const WEB_SEARCH_TRIGGER_MODE = (process.env.EXPO_PUBLIC_WEB_SEARCH_TRIGGER_MODE || 'auto') as 'auto' | 'always' | 'never';

/**
 * Location context for web search user_location parameter
 */
export interface WebSearchLocationContext {
  city?: string;
  region?: string;
  country?: string;
}

/**
 * Citation from web search results
 */
export interface WebSearchCitation {
  url: string;
  title?: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Response from the Responses API with web search
 */
export interface ResponsesAPIResult {
  outputText: string;
  citations: WebSearchCitation[];
  webSearchUsed: boolean;
}

/**
 * Options for creating a response with web search
 */
export interface ResponsesAPIOptions {
  input: string;
  locationContext?: WebSearchLocationContext;
  enableWebSearch?: boolean;
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
  };
}

/**
 * Extract URL citations from Responses API output
 */
function extractUrlCitations(output: any[]): WebSearchCitation[] {
  const citations: WebSearchCitation[] = [];

  for (const item of output) {
    if (item.type === 'message' && item.content) {
      for (const content of item.content) {
        if (content.type === 'output_text' && content.annotations) {
          for (const annotation of content.annotations) {
            if (annotation.type === 'url_citation') {
              citations.push({
                url: annotation.url,
                title: annotation.title,
                startIndex: annotation.start_index,
                endIndex: annotation.end_index,
              });
            }
          }
        }
      }
    }
  }

  return citations;
}

/**
 * Create a response using the Responses API with optional web search
 * Falls back to direct fetch if SDK doesn't support responses endpoint
 */
export async function createResponseWithSearch(
  options: ResponsesAPIOptions
): Promise<ResponsesAPIResult> {
  const { input, locationContext, enableWebSearch = true, jsonSchema } = options;

  // Build the request body
  const requestBody: Record<string, unknown> = {
    model: MODEL,
    input,
  };

  // Add web search tool if enabled
  if (enableWebSearch && WEB_SEARCH_ENABLED) {
    const webSearchTool: Record<string, unknown> = {
      type: 'web_search',
    };

    // Add location context if provided
    if (locationContext && (locationContext.city || locationContext.region)) {
      webSearchTool.user_location = {
        type: 'approximate',
        city: locationContext.city || '',
        region: locationContext.region || '',
        country: locationContext.country || 'US',
      };
    }

    requestBody.tools = [webSearchTool];
  }

  // Add JSON schema format if provided
  if (jsonSchema) {
    requestBody.text = {
      format: {
        type: 'json_schema',
        name: jsonSchema.name,
        strict: true,
        schema: jsonSchema.schema,
      },
    };
  }

  // Use direct fetch since SDK may not support Responses API yet
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(`Responses API error: ${response.status} - ${errorBody}`);
    (error as any).statusCode = response.status;
    (error as any).name = 'ResponsesAPIError';
    throw error;
  }

  const data = await response.json();

  // Extract output text and citations
  const outputText = data.output_text || '';
  const citations = extractUrlCitations(data.output || []);
  const webSearchUsed = data.output?.some((item: any) =>
    item.type === 'web_search_call'
  ) || false;

  return {
    outputText,
    citations,
    webSearchUsed,
  };
}
