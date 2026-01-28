/**
 * Configuration for GPT-5 web search feature
 */

/**
 * Trigger keywords that indicate the user wants "hidden gems" or local favorites
 * Web search will be automatically triggered when these phrases are detected
 */
export const WEB_SEARCH_TRIGGER_KEYWORDS = [
  // Hidden gem indicators
  'hidden gem',
  'hidden gems',
  'local favorite',
  'local favorites',
  'off the beaten path',
  'off-the-beaten-path',

  // Underrated/unknown
  'underrated',
  'lesser known',
  'lesser-known',
  'not well known',
  'unknown',

  // Hole in the wall / mom and pop
  'hole in the wall',
  'hole-in-the-wall',
  'mom and pop',
  'mom-and-pop',
  'family owned',
  'family-owned',

  // Unique / quirky
  'unique',
  'unusual',
  'quirky',
  'unconventional',
  'one of a kind',
  'one-of-a-kind',
  'weird',
  'funky',
  'eclectic',

  // Authentic / traditional
  'authentic',
  'traditional',
  'real deal',

  // Local / neighborhood
  'neighborhood spot',
  'neighborhood gem',
  'locals only',
  'where locals go',
  'local secret',
];

/**
 * Allowed domains for web search results
 * These are reputable sources for venue information
 */
export const WEB_SEARCH_ALLOWED_DOMAINS = [
  // Review sites
  'yelp.com',
  'tripadvisor.com',
  'zagat.com',

  // Food & drink publications
  'eater.com',
  'thrillist.com',
  'timeout.com',
  'infatuation.com',
  'bonappetit.com',
  'foodandwine.com',

  // Local news / guides
  'austinchronicle.com',
  'sfgate.com',
  'nytimes.com',
  'washingtonpost.com',
  'latimes.com',
  'chicagotribune.com',

  // Travel sites
  'fodors.com',
  'lonelyplanet.com',
  'frommers.com',

  // Social/community
  'reddit.com',
];

/**
 * Domains to exclude from web search results
 */
export const WEB_SEARCH_BLOCKED_DOMAINS = [
  // Aggregators with potentially stale data
  'yellowpages.com',
  'whitepages.com',

  // Generic business listings
  'manta.com',
  'bbb.org',
];

/**
 * Check if a prompt contains web search trigger keywords
 */
export function containsWebSearchTriggers(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();

  return WEB_SEARCH_TRIGGER_KEYWORDS.some((keyword) =>
    lowerPrompt.includes(keyword.toLowerCase())
  );
}

/**
 * Extract matched trigger keywords from a prompt
 */
export function extractMatchedTriggers(prompt: string): string[] {
  const lowerPrompt = prompt.toLowerCase();

  return WEB_SEARCH_TRIGGER_KEYWORDS.filter((keyword) =>
    lowerPrompt.includes(keyword.toLowerCase())
  );
}
