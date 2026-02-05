import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, MapColors, tailwind } from '@/constants/theme';
import {
  milesToMeters,
  getPointAtBearing,
  calculateDistanceMiles,
  radiusToMapDeltas,
} from '@/lib/geo-utils';

// Pastel map style for Google Maps - tailwind-inspired soft colors (consistent with route-map)
const PASTEL_MAP_STYLE = [
  // Base geometry - soft gray from tailwind gray-50
  { elementType: 'geometry', stylers: [{ color: '#F9FAFB' }] },
  // Labels - gray-600 for readability
  { elementType: 'labels.text.fill', stylers: [{ color: '#4B5563' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  // Administrative boundaries - gray-300
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#D1D5DB' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  // Roads - white with subtle gray stroke
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E5E7EB' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  // Highways - soft amber/yellow tint (amber-100)
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FEF3C7' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#FDE68A' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4B5563' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  // Water - soft blue (blue-100)
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DBEAFE' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#60A5FA' }] },
  // Parks - soft emerald/green (emerald-100)
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D1FAE5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#059669' }] },
  // Landscape - subtle warm tint
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F3F4F6' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ECFDF5' }] },
  // Hide POI labels for cleaner look
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  // Hide transit for cleaner look
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
];

interface RadiusSelectorProps {
  userLocation: {
    latitude: number;
    longitude: number;
  };
  initialRadius?: number;
  onConfirm: (radiusMiles: number) => void;
  onCancel: () => void;
}

const PRESET_RADII = [5, 10, 25, 50, 100];
const MIN_RADIUS = 1;
const MAX_RADIUS = 100;

// Colors for different interaction states
const CIRCLE_COLORS = {
  default: {
    stroke: MapColors.radius.stroke,
    fill: MapColors.radius.fill,
  },
  active: {
    stroke: `${tailwind.emerald500}CC`, // Green with 80% opacity for dragging
    fill: `${tailwind.emerald500}1F`,   // Green with 12% opacity
  },
};

export function RadiusSelector({
  userLocation,
  initialRadius = 25,
  onConfirm,
  onCancel,
}: RadiusSelectorProps) {
  const [radiusMiles, setRadiusMiles] = useState(initialRadius);
  const [mapReady, setMapReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const mapRef = useRef<MapView>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  // Calculate handle position (East of center)
  const handlePosition = useMemo(() => {
    const radiusKm = radiusMiles * 1.609344;
    return getPointAtBearing(
      userLocation.latitude,
      userLocation.longitude,
      radiusKm,
      90 // East
    );
  }, [userLocation.latitude, userLocation.longitude, radiusMiles]);

  // Calculate initial map region - moderately zoomed out to show context
  const initialMapRegion = useMemo(() => {
    // Use 50 miles as a reasonable initial view regardless of selected radius
    const deltas = radiusToMapDeltas(50, userLocation.latitude, 3.0);
    return {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      ...deltas,
    };
  }, [userLocation.latitude, userLocation.longitude]);

  // Calculate current map region for the selected radius
  const mapRegion = useMemo(() => {
    const deltas = radiusToMapDeltas(radiusMiles, userLocation.latitude);
    return {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      ...deltas,
    };
  }, [userLocation.latitude, userLocation.longitude, radiusMiles]);

  // Only animate map when preset buttons are pressed (not during drag)
  const [shouldAnimateMap, setShouldAnimateMap] = useState(false);

  useEffect(() => {
    if (shouldAnimateMap && mapRef.current) {
      mapRef.current.animateToRegion(mapRegion, 300);
      setShouldAnimateMap(false);
    }
  }, [shouldAnimateMap, mapRegion]);

  // Fallback: if map doesn't report ready after 3 seconds, show it anyway
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!mapReady) {
        console.log('⚠️ RadiusSelector map ready timeout - forcing visible');
        setMapReady(true);
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [mapReady]);

  // Handle real-time drag updates for immediate circle feedback
  const handleDrag = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const newRadius = calculateDistanceMiles(
      userLocation.latitude,
      userLocation.longitude,
      latitude,
      longitude
    );
    setRadiusMiles(Math.round(Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, newRadius))));
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (e: any) => {
    handleDrag(e);
    setIsDragging(false);
  };

  const handlePresetPress = (preset: number) => {
    setRadiusMiles(preset);
    setShouldAnimateMap(true); // Animate map only for preset button presses
  };

  // Zoom map to fit the full radius circle with padding
  const zoomToRadiusExtents = useCallback(() => {
    if (!mapRef.current) return;

    // Calculate region that shows full circle with padding (2.2x multiplier)
    const deltas = radiusToMapDeltas(radiusMiles, userLocation.latitude, 2.2);
    const region = {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      ...deltas,
    };

    mapRef.current.animateToRegion(region, 300);
  }, [radiusMiles, userLocation.latitude, userLocation.longitude]);

  // Determine current circle colors based on interaction state
  const currentCircleColors = isDragging
    ? CIRCLE_COLORS.active
    : CIRCLE_COLORS.default;

  // Animated style for the drag handle
  const handleScale = useSharedValue(1);

  const animatedHandleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: handleScale.value }],
  }));

  // Scale up handle when dragging
  useEffect(() => {
    handleScale.value = withSpring(isDragging ? 1.15 : 1, {
      damping: 15,
      stiffness: 150,
    });
  }, [isDragging, handleScale]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
            <ThemedText style={[styles.headerButtonText, { color: colors.tint }]}>
              Cancel
            </ThemedText>
          </TouchableOpacity>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            Search Radius
          </ThemedText>
          <TouchableOpacity onPress={() => onConfirm(radiusMiles)} style={styles.headerButton}>
            <ThemedText style={[styles.headerButtonText, { color: colors.tint }]}>
              Done
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Map with circle overlay */}
        <View style={styles.mapContainer}>
          {/* Loading indicator while map initializes */}
          {!mapReady && (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="large" color={colors.tint} />
              <ThemedText style={styles.mapLoadingText}>Loading map...</ThemedText>
            </View>
          )}

          {/* MapView - not wrapped in GestureDetector to avoid rendering issues */}
          <MapView
            ref={mapRef}
            style={[styles.map, !mapReady && styles.mapHidden]}
            provider={PROVIDER_GOOGLE}
            customMapStyle={PASTEL_MAP_STYLE}
            initialRegion={initialMapRegion}
            showsUserLocation={false}
            showsMyLocationButton={false}
            scrollEnabled={true}
            zoomEnabled={true}
            rotateEnabled={false}
            pitchEnabled={false}
            onMapReady={() => {
              console.log('✅ RadiusSelector map ready');
              setMapReady(true);
            }}
            onMapLoaded={() => {
              console.log('✅ RadiusSelector map tiles loaded');
              setMapReady(true);
            }}
          >
            {/* Radius circle - changes color based on interaction */}
            <Circle
              center={userLocation}
              radius={milesToMeters(radiusMiles)}
              strokeColor={currentCircleColors.stroke}
              fillColor={currentCircleColors.fill}
              strokeWidth={isDragging ? 3.5 : 2.5}
              lineDashPattern={Platform.OS === 'ios' ? [8, 4] : undefined}
            />

            {/* Center marker */}
            <Marker
              coordinate={userLocation}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.centerMarker}>
                <IconSymbol name="location.fill" size={28} color={colors.tint} />
              </View>
            </Marker>

            {/* Draggable edge handle - larger and more responsive */}
            <Marker
              coordinate={{
                latitude: handlePosition.lat,
                longitude: handlePosition.lon,
              }}
              draggable
              onDragStart={handleDragStart}
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={true}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <Animated.View style={[styles.dragHandle, animatedHandleStyle, isDragging && styles.dragHandleActive]}>
                <IconSymbol name="arrow.left.and.right" size={24} color="#FFFFFF" />
              </Animated.View>
            </Marker>
          </MapView>

          {/* Zoom to fit button - replaces double-tap gesture */}
          <TouchableOpacity
            style={styles.zoomToFitButton}
            onPress={zoomToRadiusExtents}
            activeOpacity={0.8}
          >
            <IconSymbol name="arrow.up.left.and.arrow.down.right" size={18} color={tailwind.gray700} />
          </TouchableOpacity>

          {/* Radius display overlay */}
          <View style={[
            styles.radiusOverlay,
            isDragging && styles.radiusOverlayActive,
            isDragging && { borderColor: `${tailwind.emerald500}40` },
          ]}>
            <ThemedText style={[
              styles.radiusText,
              isDragging && styles.radiusTextActive,
            ]}>
              {radiusMiles} miles
            </ThemedText>
          </View>
        </View>

        {/* Preset buttons */}
        <View style={styles.presetsContainer}>
          <ThemedText style={styles.presetsLabel}>Quick select:</ThemedText>
          <View style={styles.presetButtons}>
            {PRESET_RADII.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.presetButton,
                  radiusMiles === preset && styles.presetButtonActive,
                ]}
                onPress={() => handlePresetPress(preset)}
              >
                <ThemedText
                  style={[
                    styles.presetButtonText,
                    radiusMiles === preset && styles.presetButtonTextActive,
                  ]}
                >
                  {preset} mi
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Help text */}
        <ThemedText style={[styles.helpText, { paddingBottom: Math.max(28, insets.bottom + 8) }]}>
          Drag the handle to adjust the radius, or use the quick select buttons.
          All route stops will be within this distance.
        </ThemedText>
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tailwind.gray200,
  },
  headerButton: {
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapHidden: {
    opacity: 0,
  },
  zoomToFitButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tailwind.gray100,
    zIndex: 10,
  },
  mapLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: tailwind.gray500,
  },
  centerMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tailwind.indigo500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandleActive: {
    backgroundColor: tailwind.emerald500,
  },
  radiusOverlay: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: MapColors.label.background,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: `${tailwind.indigo500}26`, // 15% opacity
  },
  radiusOverlayActive: {
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  radiusText: {
    fontSize: 20,
    fontWeight: '700',
    color: tailwind.gray800,
    letterSpacing: 0.3,
  },
  radiusTextActive: {
    fontSize: 22,
    fontWeight: '800',
  },
  presetsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  presetsLabel: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.6,
    marginBottom: 14,
  },
  presetButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tailwind.gray200,
    alignItems: 'center',
    backgroundColor: tailwind.gray50,
  },
  presetButtonActive: {
    backgroundColor: tailwind.indigo500,
    borderColor: tailwind.indigo500,
  },
  presetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: tailwind.gray700,
  },
  presetButtonTextActive: {
    color: '#FFFFFF',
  },
  helpText: {
    fontSize: 13,
    opacity: 0.55,
    textAlign: 'center',
    paddingHorizontal: 28,
    lineHeight: 19,
  },
});
