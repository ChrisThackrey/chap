/**
 * Dynamic Expo config. Extends app.json and injects secrets from the
 * environment so no API key is committed to the repository.
 *
 * EXPO_PUBLIC_GOOGLE_MAPS_API_KEY comes from `.env` locally and from the
 * `env` block of the matching profile in eas.json on EAS builds. It is used
 * both by the native Maps SDKs (via the config below) and by the JS Places /
 * Directions clients (via process.env at bundle time).
 */
module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!googleMapsApiKey) {
    console.warn(
      '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set; native maps will not render. Add it to .env or the EAS build profile.'
    );
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      config: {
        ...(config.ios && config.ios.config),
        ...(googleMapsApiKey ? { googleMapsApiKey } : {}),
      },
    },
    android: {
      ...config.android,
      config: {
        ...(config.android && config.android.config),
        ...(googleMapsApiKey ? { googleMaps: { apiKey: googleMapsApiKey } } : {}),
      },
    },
  };
};
