import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PromptInput } from '@/components/route-planner/prompt-input';
import { LoadingState } from '@/components/route-planner/loading-state';
import { RouteSummary } from '@/components/route-planner/route-summary';
import { RouteMap } from '@/components/route-planner/route-map';
import { LocationSelector } from '@/components/route-planner/location-selector';
import { RadiusSelector } from '@/components/route-planner/radius-selector';
import { VenueCountSelector } from '@/components/route-planner/venue-count-selector';
import { SavedRoutesList } from '@/components/route-planner/saved-routes-list';
import { AddStopModal } from '@/components/route-planner/add-stop-modal';
import { RouteBuilderModal } from '@/components/route-planner/route-builder-modal';
import { PlaceSearchInput } from '@/components/route-planner/place-search-input';
import { useRouteGeneration } from '@/hooks/use-route-generation';
import { useUserLocation } from '@/hooks/use-user-location';
import { useRouteStorage } from '@/hooks/use-route-storage';
import { useLocationPreference, LocationPreference } from '@/hooks/use-location-preference';
import { useRadiusPreference } from '@/hooks/use-radius-preference';
import { useVenueCountPreference } from '@/hooks/use-venue-count-preference';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, tailwind } from '@/constants/theme';
import { Route, RouteStop } from '@/types/route';
import { isGooglePlacesConfigured, GooglePlaceNew, googlePlaceToRouteStop, calculateDistance } from '@/lib/google-places';
import { STOP_ICON_MAPPING } from '@/constants/stop-icons';

function orderByProximity(
  stops: RouteStop[],
  start: { latitude: number; longitude: number } | null
): RouteStop[] {
  if (stops.length <= 1) return stops.map((s, i) => ({ ...s, order: i + 1 }));
  const remaining = [...stops];
  const ordered: RouteStop[] = [];
  let current = start || { latitude: stops[0].latitude, longitude: stops[0].longitude };

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = calculateDistance(current.latitude, current.longitude, remaining[i].latitude, remaining[i].longitude);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const next = remaining.splice(nearestIdx, 1)[0];
    ordered.push({ ...next, order: ordered.length + 1 });
    current = { latitude: next.latitude, longitude: next.longitude };
  }
  return ordered;
}

export default function RoutePlannerScreen() {
  const {
    state,
    route,
    routePlan,
    warnings,
    error,
    generatePlan,
    cancelBuilding,
    reset,
    loadRoute,
    // Add stop
    canAddStop,
    // Create route from stops
    createRouteFromStops,
    // Remove stop
    removeStop,
    isRemovingStop,
  } = useRouteGeneration();
  const { location: deviceLocation, requestLocation } = useUserLocation();
  const { routes: savedRoutes, loading: loadingRoutes, saveRoute, deleteRoute } = useRouteStorage();
  const { location: preferredLocation, saveLocation, getLocationContext } = useLocationPreference();
  const { radius, saveRadius } = useRadiusPreference();
  const { venueCount, saveVenueCount } = useVenueCountPreference();
  const [showLocationSelector, setShowLocationSelector] = useState(!preferredLocation);
  const [showRadiusSelector, setShowRadiusSelector] = useState(false);
  const [showVenueCountSelector, setShowVenueCountSelector] = useState(false);
  const [showAddStopSuggestion, setShowAddStopSuggestion] = useState(false);
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [pinnedStops, setPinnedStops] = useState<RouteStop[]>([]);
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const lastPromptRef = useRef<string>('');
  const pinnedStopsRef = useRef<RouteStop[]>([]);
  pinnedStopsRef.current = pinnedStops;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const addStopSearchLocation = useMemo(() => {
    if (route && route.stops.length > 0) {
      return {
        latitude: route.stops.reduce((s, st) => s + st.latitude, 0) / route.stops.length,
        longitude: route.stops.reduce((s, st) => s + st.longitude, 0) / route.stops.length,
      };
    }
    if (preferredLocation) {
      return { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude };
    }
    return deviceLocation;
  }, [route, preferredLocation, deviceLocation]);

  const canAddMoreStops = canAddStop;

  // Log validation warnings to console
  useEffect(() => {
    if (warnings.length > 0) {
      console.log('Route validation warnings:', warnings.length);
      warnings.forEach((w) => {
        const prefix = w.severity === 'error' ? '!!!' : w.severity === 'warning' ? '???' : 'iii';
        console.log(`${prefix} [${w.severity}] ${w.stopName || 'General'}: ${w.message}`);
      });
    }
  }, [warnings]);

  // Request location when map appears (covers saved-route loads that skip requestLocation)
  useEffect(() => {
    if (state === 'success' && !deviceLocation) {
      requestLocation();
    }
  }, [state, deviceLocation, requestLocation]);

  // Show suggestion banner after route generates
  useEffect(() => {
    if (state === 'success' && canAddMoreStops) {
      const timer = setTimeout(() => setShowAddStopSuggestion(true), 800);
      return () => clearTimeout(timer);
    }
    setShowAddStopSuggestion(false);
  }, [state, canAddMoreStops]);

  // Merge pinned stops after AI generation succeeds
  useEffect(() => {
    if (state === 'success' && route && pinnedStopsRef.current.length > 0) {
      const userLoc = preferredLocation
        ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
        : deviceLocation;
      const allStops = [...pinnedStopsRef.current, ...route.stops];
      const ordered = orderByProximity(allStops, userLoc);
      loadRoute({ ...route, stops: ordered });
      setPinnedStops([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]); // deliberately minimal deps to fire once on success transition

  const handleLocationSelected = async (location: LocationPreference) => {
    await saveLocation(location);
    setShowLocationSelector(false);
  };

  const handleGenerate = async (prompt: string) => {
    lastPromptRef.current = prompt;
    let userLoc = preferredLocation
      ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
      : deviceLocation;

    if (!userLoc) {
      userLoc = await requestLocation();
    }

    const locationContext = preferredLocation ? getLocationContext() : undefined;
    const currentVenueCount = venueCount?.count || 3;
    const aiVenueCount = Math.max(0, currentVenueCount - pinnedStops.length);

    if (aiVenueCount === 0 && pinnedStops.length > 0) {
      createRouteFromStops(pinnedStops, 'Custom Route', {
        userLocation: userLoc || undefined,
        locationContext,
        maxDistanceMiles: radius?.radiusMiles || 25,
        venueCount: currentVenueCount,
      }, prompt);
      setPinnedStops([]);
      return;
    }

    await generatePlan(prompt, {
      userLocation: userLoc || undefined,
      locationContext,
      maxDistanceMiles: radius?.radiusMiles || 25,
      venueCount: aiVenueCount,
      pinnedStopNames: pinnedStops.length > 0 ? pinnedStops.map(s => s.name) : undefined,
    });
  };

  const handleSave = async () => {
    if (route) {
      try {
        await saveRoute(route);
        Alert.alert('Saved', 'Route saved successfully');
      } catch (error) {
        console.error('Failed to save route:', error);
        Alert.alert('Error', 'Failed to save route. Please try again.');
      }
    }
  };

  const handleLoadRoute = (selectedRoute: Route) => {
    loadRoute(selectedRoute);
  };

  const handleDeleteRoute = (routeId: string) => {
    Alert.alert('Delete Route', 'Are you sure you want to delete this saved route?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRoute(routeId) },
    ]);
  };

  const handleOpenAddStop = useCallback(() => {
    setShowAddStopModal(true);
    setShowAddStopSuggestion(false);
  }, []);

  const handleAddStopSelect = useCallback((stop: RouteStop) => {
    if (!route) return;
    try {
      const allStops = [...route.stops, stop];
      const userLoc = preferredLocation
        ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
        : deviceLocation;
      const ordered = orderByProximity(allStops, userLoc);
      loadRoute({
        ...route,
        stops: ordered,
        segments: undefined,
      });
      setShowAddStopModal(false);
    } catch (err) {
      console.error('[RoutePlanner] Failed to add stop:', err);
      setShowAddStopModal(false);
    }
  }, [route, preferredLocation, deviceLocation, loadRoute]);

  const handlePinPlace = useCallback((place: GooglePlaceNew) => {
    if (pinnedStops.some(s => s.venueDetails?.placeId === place.id)) return;
    const newStop = googlePlaceToRouteStop(place, pinnedStops.length + 1);
    if (!newStop) return;
    setPinnedStops(prev => [...prev, newStop]);
    setShowPlaceSearch(false);
  }, [pinnedStops]);

  const handleRemovePinnedStop = useCallback((stopId: string) => {
    setPinnedStops(prev => prev.filter(s => s.id !== stopId));
  }, []);

  const handleBuilderComplete = useCallback((stops: RouteStop[], title: string) => {
    const userLoc = preferredLocation
      ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
      : deviceLocation;
    const allStops = [...pinnedStops, ...stops];
    const ordered = orderByProximity(allStops, userLoc);
    createRouteFromStops(ordered, title, {
      userLocation: userLoc || undefined,
      locationContext: preferredLocation ? getLocationContext() : undefined,
      maxDistanceMiles: radius?.radiusMiles || 25,
      venueCount: allStops.length,
    }, lastPromptRef.current || undefined);
    setPinnedStops([]);
  }, [pinnedStops, preferredLocation, deviceLocation, createRouteFromStops, getLocationContext, radius]);

  return (
    <ThemedView style={styles.container}>
      {/* Settings Badges Row */}
      {preferredLocation && state !== 'success' && (
        <View style={styles.badgeRow}>
          {/* Location Badge */}
          <TouchableOpacity
            style={[styles.locationBadge, { backgroundColor: colors.tint }]}
            onPress={() => setShowLocationSelector(true)}
          >
            <IconSymbol name="mappin.circle.fill" size={16} color="#FFFFFF" />
            <ThemedText style={styles.locationBadgeText}>
              {preferredLocation.displayName}
            </ThemedText>
            <IconSymbol name="chevron.down" size={14} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Radius Badge */}
          <TouchableOpacity
            style={[styles.radiusBadge, { borderColor: colors.tint }]}
            onPress={() => setShowRadiusSelector(true)}
          >
            <IconSymbol name="circle.dashed" size={16} color={colors.tint} />
            <ThemedText style={[styles.radiusBadgeText, { color: colors.tint }]}>
              {radius?.radiusMiles || 25} mi
            </ThemedText>
          </TouchableOpacity>

          {/* Venue Count Badge */}
          <TouchableOpacity
            style={[styles.radiusBadge, { borderColor: colors.tint }]}
            onPress={() => setShowVenueCountSelector(true)}
          >
            <IconSymbol name="mappin.and.ellipse" size={16} color={colors.tint} />
            <ThemedText style={[styles.radiusBadgeText, { color: colors.tint }]}>
              {venueCount?.count || 3} stops
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {/* Location Selector Modal */}
      <Modal
        visible={showLocationSelector}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <ScrollView>
          <ThemedView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText type="title">Choose Location</ThemedText>
              {preferredLocation && (
                <TouchableOpacity onPress={() => setShowLocationSelector(false)}>
                  <ThemedText style={[styles.closeButton, { color: colors.tint }]}>
                    Done
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
            <LocationSelector
              onLocationSelected={handleLocationSelected}
              currentLocation={preferredLocation || undefined}
            />
          </ThemedView>
        </ScrollView>
      </Modal>

      {/* Radius Selector Modal */}
      <Modal
        visible={showRadiusSelector}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <RadiusSelector
          userLocation={
            preferredLocation
              ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
              : deviceLocation || { latitude: 39.8283, longitude: -98.5795 }
          }
          initialRadius={radius?.radiusMiles || 25}
          onConfirm={(miles) => {
            saveRadius({ radiusMiles: miles });
            setShowRadiusSelector(false);
          }}
          onCancel={() => setShowRadiusSelector(false)}
        />
      </Modal>

      {/* Venue Count Selector Modal */}
      <Modal
        visible={showVenueCountSelector}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <VenueCountSelector
          initialCount={venueCount?.count || 3}
          onConfirm={(count) => {
            saveVenueCount({ count });
            setShowVenueCountSelector(false);
          }}
          onCancel={() => setShowVenueCountSelector(false)}
        />
      </Modal>

      {state === 'idle' && (
        <ScrollView style={styles.idleScrollView} contentContainerStyle={styles.idleContent}>
          {/* Pinned stops chips */}
          {pinnedStops.length > 0 && (
            <View style={styles.pinnedStopsRow}>
              <ThemedText style={styles.pinnedLabel}>Must-include:</ThemedText>
              <View style={styles.pinnedChipsWrap}>
                {pinnedStops.map(stop => (
                  <View key={stop.id} style={[styles.pinnedChip, colorScheme === 'dark' && { backgroundColor: colors.surface }]}>
                    <IconSymbol
                      name={STOP_ICON_MAPPING[stop.type].ios as any}
                      size={14}
                      color={STOP_ICON_MAPPING[stop.type].color}
                    />
                    <ThemedText style={styles.pinnedChipText} numberOfLines={1}>
                      {stop.name}
                    </ThemedText>
                    <TouchableOpacity onPress={() => handleRemovePinnedStop(stop.id)}>
                      <IconSymbol name="xmark.circle.fill" size={16} color={tailwind.gray400} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          <PromptInput onGenerate={handleGenerate} loading={false} />

          {/* Pin a specific place button */}
          {isGooglePlacesConfigured() && (
            <TouchableOpacity
              style={[styles.pinPlaceButton, { borderColor: colors.border }]}
              onPress={() => setShowPlaceSearch(true)}
              activeOpacity={0.7}
            >
              <IconSymbol name="mappin" size={16} color={colors.tint} />
              <ThemedText style={[styles.pinPlaceText, { color: colors.tint }]}>
                Pin a specific place
              </ThemedText>
            </TouchableOpacity>
          )}

          <SavedRoutesList
            routes={savedRoutes}
            onSelectRoute={handleLoadRoute}
            onDeleteRoute={handleDeleteRoute}
            loading={loadingRoutes}
          />
        </ScrollView>
      )}

      {state === 'loading' && <LoadingState onCancel={reset} />}

      {state === 'planning' && <LoadingState onCancel={reset} />}

      {state === 'building' && routePlan && (
        <RouteBuilderModal
          visible={true}
          plan={routePlan}
          searchLocation={
            preferredLocation
              ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
              : deviceLocation
          }
          radiusMeters={(radius?.radiusMiles || 25) * 1609}
          pinnedStops={pinnedStops}
          onComplete={handleBuilderComplete}
          onDismiss={cancelBuilding}
        />
      )}

      {state === 'error' && (
        <ThemedView style={styles.errorContainer}>
          <ThemedText type="title" style={styles.errorTitle}>
            Oops! Something went wrong
          </ThemedText>
          <ThemedText style={styles.errorMessage}>{error}</ThemedText>
          <ThemedText style={styles.errorHint}>
            Make sure you&apos;ve added your OpenAI API key to the .env file
          </ThemedText>
          <PromptInput onGenerate={handleGenerate} loading={false} />
        </ThemedView>
      )}

      {state === 'success' && route && (
        <View style={styles.successContainer}>
          <View style={styles.mapContainer}>
            <RouteMap
              route={route}
              userLocation={deviceLocation}
              onOpenAddStop={canAddMoreStops ? handleOpenAddStop : undefined}
              onRemoveStop={removeStop}
              isRemovingStop={isRemovingStop}
              isAddingStop={false}
              onRequestLocation={requestLocation}
            />
          </View>

          {/* Suggestion banner */}
          {showAddStopSuggestion && canAddMoreStops && (
            <View style={[styles.suggestionBanner, { backgroundColor: colorScheme === 'dark' ? colors.surface : '#FFFFFF' }]}>
              <TouchableOpacity
                style={styles.suggestionContent}
                onPress={handleOpenAddStop}
                activeOpacity={0.8}
              >
                <IconSymbol name="sparkles" size={16} color={tailwind.blue500} />
                <ThemedText style={styles.suggestionText}>
                  Want to add more stops?
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowAddStopSuggestion(false)}
                style={styles.suggestionDismiss}
              >
                <IconSymbol name="xmark" size={14} color={tailwind.gray400} />
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.summaryOverlay, { backgroundColor: colorScheme === 'dark' ? 'rgba(17, 24, 39, 0.97)' : 'rgba(255, 255, 255, 0.95)' }]}>
            <ScrollView style={styles.summaryScroll} showsVerticalScrollIndicator={false}>
              <RouteSummary route={route} onSave={handleSave} onRegenerate={reset} />
            </ScrollView>
          </View>

          <AddStopModal
            visible={showAddStopModal}
            route={route}
            searchLocation={addStopSearchLocation}
            radiusMeters={(radius?.radiusMiles || 25) * 1609}
            onSelectStop={handleAddStopSelect}
            onDismiss={() => setShowAddStopModal(false)}
          />
        </View>
      )}

      {/* Place search modal for initial screen pinning */}
      <Modal visible={showPlaceSearch} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.placeSearchModal, { backgroundColor: colors.background }]}>
          <View style={styles.placeSearchHeader}>
            <ThemedText style={styles.placeSearchTitle}>Search for a Place</ThemedText>
            <TouchableOpacity onPress={() => setShowPlaceSearch(false)}>
              <IconSymbol name="xmark" size={20} color={tailwind.gray500} />
            </TouchableOpacity>
          </View>
          <PlaceSearchInput
            searchLocation={
              preferredLocation
                ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
                : deviceLocation
            }
            radiusMeters={(radius?.radiusMiles || 25) * 1609}
            onSelectPlace={handlePinPlace}
            placeholder="Search by name..."
          />
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  idleScrollView: {
    flex: 1,
  },
  idleContent: {
    paddingBottom: 32,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 56,
    flexWrap: 'wrap',
  },
  locationBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  locationBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  radiusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  radiusBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 24,
    marginBottom: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
    color: '#FF6B6B',
  },
  errorHint: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.7,
  },
  successContainer: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
  },
  // Suggestion banner
  suggestionBanner: {
    position: 'absolute',
    top: 70,
    left: 70,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  suggestionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionDismiss: {
    padding: 8,
  },
  summaryOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '40%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  summaryScroll: {
    flexGrow: 0,
  },
  // Pinned stops
  pinnedStopsRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pinnedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: tailwind.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pinnedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pinnedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: tailwind.gray100,
  },
  pinnedChipText: {
    fontSize: 14,
    fontWeight: '500',
    maxWidth: 140,
  },
  // Pin place button
  pinPlaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tailwind.gray200,
    borderStyle: 'dashed',
  },
  pinPlaceText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Place search modal
  placeSearchModal: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  placeSearchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  placeSearchTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
});
