import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

export const MODEL = 'gpt-4o';
export const FALLBACK_MODEL = 'gpt-4o-mini';

// Web search configuration from environment
export const WEB_SEARCH_ENABLED = process.env.EXPO_PUBLIC_ENABLE_WEB_SEARCH !== 'false';
export const WEB_SEARCH_TRIGGER_MODE = (process.env.EXPO_PUBLIC_WEB_SEARCH_TRIGGER_MODE || 'auto') as
  | 'auto'
  | 'always'
  | 'never';

/** True when an OpenAI API key has been provided via EXPO_PUBLIC_OPENAI_API_KEY. */
export function isOpenAIConfigured(): boolean {
  return typeof OPENAI_API_KEY === 'string' && OPENAI_API_KEY.trim().length > 0;
}

export class OpenAINotConfiguredError extends Error {
  constructor() {
    super('OpenAI API key is not configured. Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart the dev server.');
    this.name = 'OpenAINotConfiguredError';
  }
}

let client: OpenAI | null = null;

/**
 * Lazily construct the OpenAI client.
 *
 * The SDK constructor throws when no API key is present. Creating the client at
 * module load time meant that a missing `.env` crashed the entire app on launch
 * (the route planner tab imports this module). Deferring construction turns
 * that into a recoverable, user-facing error at generation time instead.
 */
export function getOpenAIClient(): OpenAI {
  if (!isOpenAIConfigured()) {
    throw new OpenAINotConfiguredError();
  }
  if (!client) {
    client = new OpenAI({
      apiKey: OPENAI_API_KEY,
      dangerouslyAllowBrowser: true, // Required for React Native/Expo environment
    });
  }
  return client;
}

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

interface ResponsesAnnotation {
  type?: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

interface ResponsesOutputItem {
  type?: string;
  content?: {
    type?: string;
    annotations?: ResponsesAnnotation[];
  }[];
}

/**
 * Extract URL citations from Responses API output
 */
function extractUrlCitations(output: ResponsesOutputItem[]): WebSearchCitation[] {
  const citations: WebSearchCitation[] = [];

  for (const item of output) {
    if (item.type !== 'message' || !item.content) continue;
    for (const content of item.content) {
      if (content.type !== 'output_text' || !content.annotations) continue;
      for (const annotation of content.annotations) {
        if (annotation.type === 'url_citation' && annotation.url) {
          citations.push({
            url: annotation.url,
            title: annotation.title,
            startIndex: annotation.start_index ?? 0,
            endIndex: annotation.end_index ?? 0,
          });
        }
      }
    }
  }

  return citations;
}

export class ResponsesAPIError extends Error {
  statusCode: number;

  constructor(statusCode: number, body: string) {
    super(`Responses API error: ${statusCode} - ${body}`);
    this.name = 'ResponsesAPIError';
    this.statusCode = statusCode;
  }
}

/**
 * Create a response using the Responses API with optional web search
 * Uses direct fetch since the installed SDK does not expose the Responses endpoint.
 */
export async function createResponseWithSearch(
  options: ResponsesAPIOptions
): Promise<ResponsesAPIResult> {
  if (!isOpenAIConfigured()) {
    throw new OpenAINotConfiguredError();
  }

  const { input, locationContext, enableWebSearch = true, jsonSchema } = options;

  const requestBody: Record<string, unknown> = {
    model: MODEL,
    input,
  };

  if (enableWebSearch && WEB_SEARCH_ENABLED) {
    const webSearchTool: Record<string, unknown> = { type: 'web_search' };

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

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new ResponsesAPIError(response.status, errorBody);
  }

  const data = await response.json();
  const output: ResponsesOutputItem[] = Array.isArray(data.output) ? data.output : [];

  return {
    outputText: typeof data.output_text === 'string' ? data.output_text : '',
    citations: extractUrlCitations(output),
    webSearchUsed: output.some((item) => item.type === 'web_search_call'),
  };
}
