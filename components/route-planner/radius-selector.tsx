import { useState, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
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

// Pastel map style for Google Maps - soft, muted colors (consistent with route-map)
const PASTEL_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f8e8d6' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e8d4c0' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e4f5' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d4edda' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a77' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
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

export function RadiusSelector({
  userLocation,
  initialRadius = 25,
  onConfirm,
  onCancel,
}: RadiusSelectorProps) {
  const [radiusMiles, setRadiusMiles] = useState(initialRadius);
  const [mapReady, setMapReady] = useState(false);
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

  const handleDragEnd = (e: any) => {
    // Final update on drag end (same logic as handleDrag)
    handleDrag(e);
  };

  const handlePresetPress = (preset: number) => {
    setRadiusMiles(preset);
    setShouldAnimateMap(true); // Animate map only for preset button presses
  };

  return (
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
          {/* Radius circle */}
          <Circle
            center={userLocation}
            radius={milesToMeters(radiusMiles)}
            strokeColor={MapColors.radius.stroke}
            fillColor={MapColors.radius.fill}
            strokeWidth={2.5}
            lineDashPattern={Platform.OS === 'ios' ? [8, 4] : undefined}
          />

          {/* Center marker */}
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.centerMarker}>
              <IconSymbol name="location.fill" size={24} color={colors.tint} />
            </View>
          </Marker>

          {/* Draggable edge handle */}
          <Marker
            coordinate={{
              latitude: handlePosition.lat,
              longitude: handlePosition.lon,
            }}
            draggable
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={true}
          >
            <View style={styles.dragHandle}>
              <IconSymbol name="arrow.left.and.right" size={18} color="#FFFFFF" />
            </View>
          </Marker>
        </MapView>

        {/* Radius display overlay */}
        <View style={styles.radiusOverlay}>
          <ThemedText style={styles.radiusText}>{radiusMiles} miles</ThemedText>
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
        Drag the handle to adjust the search radius, or tap a preset above.
        All route stops will be within this distance.
      </ThemedText>
    </ThemedView>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tailwind.indigo500,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: tailwind.indigo500,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
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
    borderWidth: 1,
    borderColor: `${tailwind.indigo500}26`, // 15% opacity
  },
  radiusText: {
    fontSize: 20,
    fontWeight: '700',
    color: tailwind.gray800,
    letterSpacing: 0.3,
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
