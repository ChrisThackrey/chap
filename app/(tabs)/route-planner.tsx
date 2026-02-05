import { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PromptInput } from '@/components/route-planner/prompt-input';
import { LoadingState } from '@/components/route-planner/loading-state';
import { RouteSummary } from '@/components/route-planner/route-summary';
import { RouteMap } from '@/components/route-planner/route-map';
import { LocationSelector } from '@/components/route-planner/location-selector';
import { RadiusSelector } from '@/components/route-planner/radius-selector';
import { SavedRoutesList } from '@/components/route-planner/saved-routes-list';
import { useRouteGeneration } from '@/hooks/use-route-generation';
import { useUserLocation } from '@/hooks/use-user-location';
import { useRouteStorage } from '@/hooks/use-route-storage';
import { useLocationPreference, LocationPreference } from '@/hooks/use-location-preference';
import { useRadiusPreference } from '@/hooks/use-radius-preference';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Route } from '@/types/route';

export default function RoutePlannerScreen() {
  const {
    state,
    route,
    warnings,
    error,
    generate,
    reset,
    loadRoute,
    isAddingStop,
    addStopError,
    addStop,
    clearAddStopError,
    removeStop,
    isRemovingStop,
    optimizeCurrentRoute,
    optimizationState,
    optimizedSegments,
  } = useRouteGeneration();
  const { location: deviceLocation, requestLocation } = useUserLocation();
  const { routes: savedRoutes, loading: loadingRoutes, saveRoute, deleteRoute } = useRouteStorage();
  const { location: preferredLocation, saveLocation, getLocationContext } = useLocationPreference();
  const { radius, saveRadius } = useRadiusPreference();
  const [showLocationSelector, setShowLocationSelector] = useState(!preferredLocation);
  const [showRadiusSelector, setShowRadiusSelector] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  // Log validation warnings to console instead of displaying on screen
  useEffect(() => {
    if (warnings.length > 0) {
      console.log('Route validation warnings:', warnings.length);
      warnings.forEach((w) => {
        const prefix = w.severity === 'error' ? '❌' : w.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`${prefix} [${w.severity}] ${w.stopName || 'General'}: ${w.message}`);
        if (w.suggestedAction) {
          console.log(`   💡 ${w.suggestedAction}`);
        }
      });
    }
  }, [warnings]);

  const handleLocationSelected = async (location: LocationPreference) => {
    await saveLocation(location);
    setShowLocationSelector(false);
  };

  const handleGenerate = async (prompt: string) => {
    // Use preferred location if set, otherwise try to get device location
    let userLoc = preferredLocation
      ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
      : deviceLocation;

    if (!userLoc) {
      userLoc = await requestLocation();
    }

    const locationContext = preferredLocation ? getLocationContext() : undefined;

    await generate(prompt, {
      userLocation: userLoc || undefined,
      locationContext,
      maxDistanceMiles: radius?.radiusMiles || 25,
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

  const handleAddStop = async (prompt: string): Promise<{ success: boolean }> => {
    console.log('[handleAddStop] Called with prompt:', prompt);
    // Use preferred location if set, otherwise try to get device location
    let userLoc = preferredLocation
      ? { latitude: preferredLocation.latitude, longitude: preferredLocation.longitude }
      : deviceLocation;

    console.log('[handleAddStop] User location:', userLoc);

    if (!userLoc) {
      console.log('[handleAddStop] No location, requesting...');
      userLoc = await requestLocation();
    }

    const locationContext = preferredLocation ? getLocationContext() : undefined;
    console.log('[handleAddStop] Location context:', locationContext);

    const result = await addStop(prompt, {
      userLocation: userLoc || undefined,
      locationContext,
      maxDistanceMiles: radius?.radiusMiles || 25,
    });
    console.log('[handleAddStop] addStop result:', result);

    // ✅ Explicitly trigger optimization after successfully adding stop
    if (result.success && result.needsOptimization && result.updatedRoute) {
      console.log('[handleAddStop] Stop added successfully, triggering optimization...');
      console.log('[handleAddStop] Updated route has', result.updatedRoute.stops.length, 'stops');
      try {
        // Pass the updated route to avoid stale closure issues
        await optimizeCurrentRoute(result.updatedRoute);
        console.log('[handleAddStop] Optimization complete');
      } catch (error) {
        console.error('[handleAddStop] Optimization failed:', error);
        // Don't return false - the stop was still added successfully
      }
    }

    return result;
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

      {state === 'idle' && (
        <ScrollView style={styles.idleScrollView} contentContainerStyle={styles.idleContent}>
          <PromptInput onGenerate={handleGenerate} loading={false} />
          <SavedRoutesList
            routes={savedRoutes}
            onSelectRoute={handleLoadRoute}
            onDeleteRoute={handleDeleteRoute}
            loading={loadingRoutes}
          />
        </ScrollView>
      )}

      {state === 'loading' && <LoadingState onCancel={reset} />}

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
        <View style={[styles.successContainer, { paddingTop: insets.top }]}>
          <View style={styles.mapContainer}>
            <RouteMap
              route={route}
              optimizedSegments={optimizedSegments}
              isOptimizing={optimizationState === 'optimizing'}
              onAddStop={handleAddStop}
              isAddingStop={isAddingStop}
              addStopError={addStopError}
              onClearAddStopError={clearAddStopError}
              onRemoveStop={removeStop}
              isRemovingStop={isRemovingStop}
            />
          </View>
          <View style={styles.summaryOverlay}>
            <ScrollView style={styles.summaryScroll} showsVerticalScrollIndicator={false}>
              <RouteSummary route={route} onSave={handleSave} onRegenerate={reset} />
            </ScrollView>
          </View>
        </View>
      )}
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
});
