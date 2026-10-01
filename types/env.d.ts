declare namespace NodeJS {
  interface ProcessEnv {
    /** OpenAI API key used for route generation. */
    EXPO_PUBLIC_OPENAI_API_KEY?: string;
    /** Google Maps / Places / Directions API key. */
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
    /** Foursquare Places v3 API key (optional fallback venue provider). */
    EXPO_PUBLIC_FOURSQUARE_API_KEY?: string;
    /** Set to "false" to disable OpenAI web search entirely. */
    EXPO_PUBLIC_ENABLE_WEB_SEARCH?: string;
    /** "auto" (default), "always" or "never". */
    EXPO_PUBLIC_WEB_SEARCH_TRIGGER_MODE?: string;
  }
}
