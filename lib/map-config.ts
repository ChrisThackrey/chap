import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { PROVIDER_DEFAULT, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';

/**
 * Shared map configuration used by every MapView in the app.
 *
 * Expo Go does not bundle the Google Maps SDK on iOS, so requesting
 * PROVIDER_GOOGLE there crashes at mount. Development/production builds use
 * Google everywhere so the custom light/dark styles apply consistently.
 */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const MAP_PROVIDER = Platform.OS === 'ios' && IS_EXPO_GO ? PROVIDER_DEFAULT : PROVIDER_GOOGLE;

/** Google Maps custom styling is only honoured by the Google provider. */
export const SUPPORTS_CUSTOM_MAP_STYLE = MAP_PROVIDER === PROVIDER_GOOGLE;

/** Pastel light-mode style, tailwind-inspired. */
export const PASTEL_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F9FAFB' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4B5563' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#D1D5DB' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E5E7EB' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FEF3C7' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#FDE68A' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4B5563' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DBEAFE' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#60A5FA' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D1FAE5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#059669' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F3F4F6' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ECFDF5' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
];

/** Dark-mode style. */
export const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1F2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#374151' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1F2937' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4B5563' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#374151' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1E3A5F' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3B82F6' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1A3A2A' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4ADE80' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#1F2937' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1A2E1A' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
];

/** Pick the map style for the current color scheme (undefined when unsupported). */
export function getMapStyle(colorScheme: 'light' | 'dark'): MapStyleElement[] | undefined {
  if (!SUPPORTS_CUSTOM_MAP_STYLE) return undefined;
  return colorScheme === 'dark' ? DARK_MAP_STYLE : PASTEL_MAP_STYLE;
}

/** Geographic centre of the contiguous US, used when no location is known. */
export const DEFAULT_MAP_CENTER = { latitude: 39.8283, longitude: -98.5795 } as const;
