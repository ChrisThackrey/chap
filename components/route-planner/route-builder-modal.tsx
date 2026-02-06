import { useState, useEffect, useCallback } from 'react';
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
import { searchNearbyPlaces, googlePlaceToRouteStop, GooglePlaceNew } from '@/lib/google-places';
import { STOP_ICON_MAPPING } from '@/constants/stop-icons';
import { SuggestionCard } from './suggestion-card';
import { RoutePlan, RouteStop } from '@/types/route';
import { tailwind } from '@/constants/theme';

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

  // Fetch places for current step
  useEffect(() => {
    if (!visible || isConfirmation || !searchLocation) return;
    if (stepPlaces.has(currentStep)) return; // already cached

    const planStop = plan.stops[currentStep];
    if (!planStop) return;

    let cancelled = false;
    setLoadingStep(currentStep);

    (async () => {
      try {
        const results = await searchNearbyPlaces(
          planStop.searchQuery,
          searchLocation.latitude,
          searchLocation.longitude,
          radiusMeters,
        );
        if (!cancelled) {
          setStepPlaces((prev) => {
            const next = new Map(prev);
            next.set(currentStep, results.slice(0, 5));
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
  }, [visible, currentStep, isConfirmation, searchLocation, radiusMeters, plan.stops, stepPlaces]);

  const handleSelectPlace = useCallback((place: GooglePlaceNew) => {
    const stop = googlePlaceToRouteStop(place, currentStep + 1);
    setSelectedStops((prev) => {
      const next = new Map(prev);
      next.set(currentStep, stop);
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
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const handleChangeStep = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

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
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
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
        <View style={styles.progressRow}>
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
            {currentPlanStop && (
              <View style={styles.categoryRow}>
                <View style={[
                  styles.categoryBadge,
                  { backgroundColor: STOP_ICON_MAPPING[currentPlanStop.type].color + '15' },
                ]}>
                  <IconSymbol
                    name={STOP_ICON_MAPPING[currentPlanStop.type].ios as any}
                    size={16}
                    color={STOP_ICON_MAPPING[currentPlanStop.type].color}
                  />
                  <ThemedText style={[
                    styles.categoryText,
                    { color: STOP_ICON_MAPPING[currentPlanStop.type].color },
                  ]}>
                    {currentPlanStop.type.charAt(0).toUpperCase() + currentPlanStop.type.slice(1)}
                  </ThemedText>
                </View>
              </View>
            )}

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
                {currentPlaces.map((place) => (
                  <SuggestionCard
                    key={place.id}
                    place={place}
                    onSelect={handleSelectPlace}
                    selectLabel="Tap to select"
                  />
                ))}
              </ScrollView>
            )}

            {/* Step footer */}
            <View style={styles.footer}>
              {currentStep > 0 && (
                <TouchableOpacity
                  style={styles.footerBtn}
                  onPress={handleBack}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="chevron.left" size={16} color={tailwind.gray600} />
                  <ThemedText style={styles.footerBtnText}>Back</ThemedText>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.footerBtn}
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
                const iconConfig = STOP_ICON_MAPPING[planStop.type];
                return (
                  <View key={i} style={styles.confirmCard}>
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
                        style={styles.confirmChangeBtn}
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
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.footerBtn}
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
    color: tailwind.gray900,
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
    color: tailwind.gray700,
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
    color: tailwind.gray600,
  },
  // Confirmation view
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: tailwind.gray900,
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
    color: tailwind.gray900,
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
