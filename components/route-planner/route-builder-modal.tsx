import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { searchNearbyPlaces, googlePlaceToRouteStop, GooglePlaceNew, calculateDistance } from '@/lib/google-places';
import { STOP_ICON_MAPPING } from '@/constants/stop-icons';
import { SuggestionCard } from './suggestion-card';
import { RoutePlan, RouteStop, StopType } from '@/types/route';
import { Colors, tailwind } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const BROAD_QUERIES: Record<StopType, string> = {
  restaurant: 'popular restaurants',
  cafe: 'coffee shops and cafes',
  bar: 'bars and pubs',
  park: 'parks and gardens',
  museum: 'museums and galleries',
  theater: 'theaters and performing arts',
  viewpoint: 'scenic viewpoints and overlooks',
  activity: 'fun activities and entertainment',
  shopping: 'shopping and stores',
};

function deduplicatePlaces(places: GooglePlaceNew[]): GooglePlaceNew[] {
  const seen = new Set<string>();
  return places.filter(place => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
}

interface RouteBuilderModalProps {
  visible: boolean;
  plan: RoutePlan;
  searchLocation: { latitude: number; longitude: number } | null;
  radiusMeters: number;
  pinnedStops: RouteStop[];
  onComplete: (stops: RouteStop[], title: string) => void;
  onDismiss: () => void;
}

export function RouteBuilderModal({
  visible,
  plan,
  searchLocation,
  radiusMeters,
  pinnedStops,
  onComplete,
  onDismiss,
}: RouteBuilderModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedStops, setSelectedStops] = useState<Map<number, RouteStop>>(new Map());
  const [stepPlaces, setStepPlaces] = useState<Map<number, GooglePlaceNew[]>>(new Map());
  const [loadingStep, setLoadingStep] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const totalSteps = plan.stops.length;
  const isConfirmation = currentStep === totalSteps;

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setCurrentStep(0);
      setSelectedStops(new Map());
      setStepPlaces(new Map());
      setLoadingStep(null);
    }
  }, [visible]);

  // Pre-fill pinned stops on mount
  useEffect(() => {
    if (!visible || pinnedStops.length === 0) return;
    const prefilled = new Map<number, RouteStop>();
    for (const pinned of pinnedStops) {
      const matchIdx = plan.stops.findIndex(
        (ps) => ps.type === pinned.type && !prefilled.has(ps.order - 1)
      );
      if (matchIdx >= 0) {
        prefilled.set(matchIdx, pinned);
      }
    }
    if (prefilled.size > 0) {
      setSelectedStops(prefilled);
      // Skip to first step that isn't pre-filled
      const firstOpen = plan.stops.findIndex((_, i) => !prefilled.has(i));
      if (firstOpen >= 0) {
        setCurrentStep(firstOpen);
      } else {
        setCurrentStep(totalSteps); // all pre-filled, go to confirmation
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // deliberately minimal deps — run once when modal opens

  // Compute dynamic search center: midpoint between last selected stop and user location
  const dynamicSearchCenter = useMemo(() => {
    if (!searchLocation) return null;
    const selectedValues = Array.from(selectedStops.values());
    if (selectedValues.length === 0) return searchLocation;
    const lastStop = selectedValues[selectedValues.length - 1];
    return {
      latitude: (lastStop.latitude + searchLocation.latitude) / 2,
      longitude: (lastStop.longitude + searchLocation.longitude) / 2,
    };
  }, [searchLocation, selectedStops]);

  // Progressive radius: tighter for later steps
  const dynamicRadius = useMemo(() => {
    const stepNum = currentStep + 1;
    const scale = stepNum === 1 ? 1.0 : stepNum === 2 ? 0.8 : stepNum === 3 ? 0.65 : 0.5;
    return radiusMeters * scale;
  }, [currentStep, radiusMeters]);

  // Fetch places for current step
  useEffect(() => {
    if (!visible || isConfirmation || !dynamicSearchCenter) return;
    if (stepPlaces.has(currentStep)) return; // already cached

    const planStop = plan.stops[currentStep];
    if (!planStop) return;

    let cancelled = false;
    setLoadingStep(currentStep);

    (async () => {
      try {
        const specificResults = await searchNearbyPlaces(
          planStop.searchQuery,
          dynamicSearchCenter.latitude,
          dynamicSearchCenter.longitude,
          dynamicRadius,
        );
        if (cancelled) return;

        let allResults = specificResults;

        // Supplementary broad search when specific query returns <10
        if (specificResults.length < 10) {
          console.log(`[RouteBuilder] Specific query returned only ${specificResults.length} results, running broader search...`);
          try {
            const broadResults = await searchNearbyPlaces(
              BROAD_QUERIES[planStop.type],
              dynamicSearchCenter.latitude,
              dynamicSearchCenter.longitude,
              Math.round(dynamicRadius * 1.5),
            );
            if (!cancelled) {
              allResults = deduplicatePlaces([...specificResults, ...broadResults]);
            }
          } catch {
            // Fallback: just use whatever the specific search found
          }
        }
        if (cancelled) return;

        // Rank-blended sort: 60% relevance (Google's order) + 40% distance rank
        const candidates = allResults.slice(0, 15);
        const withRelevanceRank = candidates.map((r, i) => ({ place: r, relevanceRank: i }));

        // Distance rank: sort by distance to search center, assign 0..N ranks
        const byDistance = [...withRelevanceRank].sort((a, b) => {
          const distA = a.place.location ? calculateDistance(
            dynamicSearchCenter.latitude, dynamicSearchCenter.longitude,
            a.place.location.latitude, a.place.location.longitude
          ) : Infinity;
          const distB = b.place.location ? calculateDistance(
            dynamicSearchCenter.latitude, dynamicSearchCenter.longitude,
            b.place.location.latitude, b.place.location.longitude
          ) : Infinity;
          return distA - distB;
        });
        const distanceRankMap = new Map<string, number>();
        byDistance.forEach((item, i) => distanceRankMap.set(item.place.id, i));

        // Blend ranks: step 0 uses pure relevance, later steps blend 60/40
        const relevanceWeight = currentStep === 0 ? 1.0 : 0.6;
        const distanceWeight = currentStep === 0 ? 0.0 : 0.4;
        const sorted = withRelevanceRank
          .sort((a, b) => {
            const scoreA = a.relevanceRank * relevanceWeight + (distanceRankMap.get(a.place.id) ?? candidates.length) * distanceWeight;
            const scoreB = b.relevanceRank * relevanceWeight + (distanceRankMap.get(b.place.id) ?? candidates.length) * distanceWeight;
            return scoreA - scoreB;
          })
          .map(item => item.place);

        if (!cancelled) {
          setStepPlaces((prev) => {
            const next = new Map(prev);
            next.set(currentStep, sorted.slice(0, 10));
            return next;
          });
        }
      } catch (err) {
        console.error('[RouteBuilder] Search error for step', currentStep, err);
        if (!cancelled) {
          setStepPlaces((prev) => {
            const next = new Map(prev);
            next.set(currentStep, []);
            return next;
          });
        }
      } finally {
        if (!cancelled) setLoadingStep(null);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, currentStep, isConfirmation, dynamicSearchCenter, dynamicRadius, plan, searchLocation, stepPlaces]);

  const handleSelectPlace = useCallback((place: GooglePlaceNew) => {
    const stop = googlePlaceToRouteStop(place, currentStep + 1);
    if (!stop) return;
    setSelectedStops((prev) => {
      const next = new Map(prev);
      next.set(currentStep, stop);
      return next;
    });
    // Clear cached results for all subsequent steps (search center has shifted)
    setStepPlaces((prev) => {
      const next = new Map(prev);
      for (let i = currentStep + 1; i < totalSteps; i++) {
        next.delete(i);
      }
      return next;
    });
    // Auto-advance
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setCurrentStep(totalSteps); // go to confirmation
    }
  }, [currentStep, totalSteps]);

  const handleSkip = useCallback(() => {
    // Remove any previous selection for this step
    setSelectedStops((prev) => {
      const next = new Map(prev);
      next.delete(currentStep);
      return next;
    });
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setCurrentStep(totalSteps);
    }
  }, [currentStep, totalSteps]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      // Clear cached results for current step and all subsequent steps
      // (going back means the user might change selection, shifting the centroid)
      setStepPlaces((prev) => {
        const next = new Map(prev);
        for (let i = currentStep; i < totalSteps; i++) {
          next.delete(i);
        }
        return next;
      });
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep, totalSteps]);

  const handleChangeStep = useCallback((step: number) => {
    // Clear cached results from the target step onward (centroid may differ)
    setStepPlaces((prev) => {
      const next = new Map(prev);
      for (let i = step; i < totalSteps; i++) {
        next.delete(i);
      }
      return next;
    });
    setCurrentStep(step);
  }, [totalSteps]);

  const handleConfirm = useCallback(() => {
    const stops = Array.from(selectedStops.values());
    if (stops.length === 0) return;
    onComplete(stops, plan.title);
  }, [selectedStops, onComplete, plan.title]);

  const selectedCount = selectedStops.size;
  const currentPlanStop = !isConfirmation ? plan.stops[currentStep] : null;
  const currentPlaces = stepPlaces.get(currentStep) || [];
  const isLoading = loadingStep === currentStep;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <ThemedText style={styles.headerTitle}>
              {isConfirmation ? 'Confirm Your Route' : `Stop ${currentStep + 1} of ${totalSteps}`}
            </ThemedText>
            {currentPlanStop && (
              <ThemedText style={styles.headerSubtitle} numberOfLines={2}>
                {currentPlanStop.description}
              </ThemedText>
            )}
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={8}>
            <IconSymbol name="xmark.circle.fill" size={28} color={tailwind.gray300} />
          </TouchableOpacity>
        </View>

        {/* Progress dots */}
        <View style={[styles.progressRow, { backgroundColor: colors.background }]}>
          {plan.stops.map((_, i) => {
            const isCompleted = selectedStops.has(i);
            const isCurrent = i === currentStep;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => handleChangeStep(i)}
                style={[
                  styles.progressDot,
                  isCompleted && styles.progressDotCompleted,
                  isCurrent && styles.progressDotCurrent,
                  !isCompleted && !isCurrent && colorScheme === 'dark' && { backgroundColor: tailwind.gray600 },
                ]}
              />
            );
          })}
          {/* Confirmation dot */}
          <View
            style={[
              styles.progressDot,
              isConfirmation && styles.progressDotCurrent,
            ]}
          />
        </View>

        {/* Step content */}
        {!isConfirmation && (
          <>
            {/* Category badge */}
            {currentPlanStop && (() => {
              const iconCfg = STOP_ICON_MAPPING[currentPlanStop.type] || STOP_ICON_MAPPING.activity;
              return (
                <View style={styles.categoryRow}>
                  <View style={[
                    styles.categoryBadge,
                    { backgroundColor: iconCfg.color + '15' },
                  ]}>
                    <IconSymbol
                      name={iconCfg.ios as any}
                      size={16}
                      color={iconCfg.color}
                    />
                    <ThemedText style={[
                      styles.categoryText,
                      { color: iconCfg.color },
                    ]}>
                      {currentPlanStop.type.charAt(0).toUpperCase() + currentPlanStop.type.slice(1)}
                    </ThemedText>
                  </View>
                </View>
              );
            })()}

            {/* Loading */}
            {isLoading && (
              <View style={styles.centeredState}>
                <ActivityIndicator size="large" color={tailwind.blue500} />
                <ThemedText style={styles.stateText}>Finding places...</ThemedText>
              </View>
            )}

            {/* Empty state */}
            {!isLoading && stepPlaces.has(currentStep) && currentPlaces.length === 0 && (
              <View style={styles.centeredState}>
                <IconSymbol name="magnifyingglass" size={36} color={tailwind.gray300} />
                <ThemedText style={styles.stateTitle}>No places found</ThemedText>
                <ThemedText style={styles.stateText}>
                  No results for this category. You can skip this stop.
                </ThemedText>
              </View>
            )}

            {/* Place results */}
            {!isLoading && currentPlaces.length > 0 && (
              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {currentPlaces.map((place) => {
                  const selectedValues = Array.from(selectedStops.values());
                  let nearestDist: number | undefined;
                  let nearestName: string | undefined;
                  if (place.location && selectedValues.length > 0) {
                    for (const s of selectedValues) {
                      const d = calculateDistance(
                        place.location.latitude, place.location.longitude,
                        s.latitude, s.longitude
                      ) * 0.621371; // km to miles
                      if (nearestDist === undefined || d < nearestDist) {
                        nearestDist = d;
                        nearestName = s.name;
                      }
                    }
                  }
                  return (
                    <SuggestionCard
                      key={place.id}
                      place={place}
                      onSelect={handleSelectPlace}
                      selectLabel="Tap to select"
                      nearestStopDistance={nearestDist}
                      nearestStopName={nearestName}
                    />
                  );
                })}
              </ScrollView>
            )}

            {/* Step footer */}
            <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
              {currentStep > 0 && (
                <TouchableOpacity
                  style={[styles.footerBtn, { borderColor: colors.border }]}
                  onPress={handleBack}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="chevron.left" size={16} color={tailwind.gray600} />
                  <ThemedText style={styles.footerBtnText}>Back</ThemedText>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={[styles.footerBtn, { borderColor: colors.border }]}
                onPress={handleSkip}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.footerBtnText}>Skip</ThemedText>
                <IconSymbol name="chevron.right" size={16} color={tailwind.gray600} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Confirmation view */}
        {isConfirmation && (
          <>
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <ThemedText style={styles.confirmTitle}>{plan.title}</ThemedText>

              {plan.stops.map((planStop, i) => {
                const selected = selectedStops.get(i);
                const iconConfig = STOP_ICON_MAPPING[planStop.type] || STOP_ICON_MAPPING.activity;
                return (
                  <View key={i} style={[styles.confirmCard, { backgroundColor: colors.surface }]}>
                    <View style={styles.confirmCardHeader}>
                      <View style={[styles.confirmIcon, { backgroundColor: iconConfig.color + '18' }]}>
                        <IconSymbol
                          name={iconConfig.ios as any}
                          size={20}
                          color={iconConfig.color}
                        />
                      </View>
                      <View style={styles.confirmCardText}>
                        {selected ? (
                          <>
                            <ThemedText style={styles.confirmName} numberOfLines={1}>
                              {selected.name}
                            </ThemedText>
                            <ThemedText style={styles.confirmAddress} numberOfLines={1}>
                              {selected.address}
                            </ThemedText>
                          </>
                        ) : (
                          <ThemedText style={styles.confirmSkipped}>(skipped)</ThemedText>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[styles.confirmChangeBtn, { borderColor: colors.border }]}
                        onPress={() => handleChangeStep(i)}
                      >
                        <ThemedText style={styles.confirmChangeText}>Change</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Confirmation footer */}
            <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.footerBtn, { borderColor: colors.border }]}
                onPress={() => setCurrentStep(totalSteps - 1)}
                activeOpacity={0.7}
              >
                <IconSymbol name="chevron.left" size={16} color={tailwind.gray600} />
                <ThemedText style={styles.footerBtnText}>Back</ThemedText>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  selectedCount === 0 && styles.confirmBtnDisabled,
                ]}
                onPress={handleConfirm}
                disabled={selectedCount === 0}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.confirmBtnText}>
                  Create Route ({selectedCount} stop{selectedCount !== 1 ? 's' : ''})
                </ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tailwind.gray200,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 14,
    color: tailwind.gray500,
    marginTop: 4,
    lineHeight: 20,
  },
  closeBtn: {
    marginTop: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tailwind.gray200,
  },
  progressDotCompleted: {
    backgroundColor: tailwind.blue500,
  },
  progressDotCurrent: {
    width: 24,
    backgroundColor: tailwind.blue400,
    borderRadius: 4,
  },
  categoryRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  stateText: {
    fontSize: 14,
    color: tailwind.gray500,
    textAlign: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tailwind.gray200,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tailwind.gray200,
  },
  footerBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Confirmation view
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  confirmCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  confirmIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmCardText: {
    flex: 1,
  },
  confirmName: {
    fontSize: 15,
    fontWeight: '600',
  },
  confirmAddress: {
    fontSize: 13,
    color: tailwind.gray500,
    marginTop: 2,
  },
  confirmSkipped: {
    fontSize: 14,
    fontStyle: 'italic',
    color: tailwind.gray400,
  },
  confirmChangeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tailwind.gray200,
  },
  confirmChangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: tailwind.blue500,
  },
  confirmBtn: {
    backgroundColor: tailwind.blue500,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
