import { Modal, View, TouchableOpacity, StyleSheet, Linking, Platform, ScrollView, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useMapColors } from '@/hooks/use-map-colors';
import { RouteStop } from '@/types/route';
import { getStopIcon } from '@/constants/stop-icons';
import { buildDisplayPhotoSource } from '@/lib/google-places';
import { VenueHours } from './venue-hours';
import { VenueTips } from './venue-tips';

const HERO_IMAGE_HEIGHT = 180;
const MIN_STOPS_PER_ROUTE = 2;

/**
 * Parse address string into components
 */
function parseAddress(address: string): { street: string; cityStateZip: string } {
  // Common patterns: "123 Main St, City, ST 12345" or "123 Main St, City, State"
  const parts = address.split(',').map(p => p.trim());

  if (parts.length >= 2) {
    const street = parts[0];
    const cityStateZip = parts.slice(1).join(', ');
    return { street, cityStateZip };
  }

  return { street: address, cityStateZip: '' };
}

interface StopDetailModalProps {
  stop: RouteStop | null;
  totalStops: number;
  visible: boolean;
  onClose: () => void;
  onRemoveStop?: (stopId: string) => Promise<void>;
  isRemovingStop?: boolean;
}

export function StopDetailModal({ stop, totalStops, visible, onClose, onRemoveStop, isRemovingStop = false }: StopDetailModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const mapColors = useMapColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Safe area padding inside the modal (for home indicator)
  const bottomPadding = Math.max(20, insets.bottom);

  // Calculate max modal height (90% of screen - extends higher for better visibility)
  const maxModalHeight = screenHeight * 0.9;

  if (!stop) return null;

  const iconConfig = getStopIcon(stop.type);
  const addressParts = parseAddress(stop.address || '');
  const heroPhoto = stop.venueDetails?.photos?.[0];
  const additionalPhotos = stop.venueDetails?.photos?.slice(1) || [];
  const canRemove = !!onRemoveStop && totalStops > MIN_STOPS_PER_ROUTE;

  const handleGetDirections = async () => {
    // Prefer coordinates over the free-text address so the maps app lands on the exact pin.
    const query = encodeURIComponent(stop.address || stop.name);
    const nativeUrl =
      Platform.OS === 'ios'
        ? `maps://?q=${query}&ll=${stop.latitude},${stop.longitude}`
        : `geo:${stop.latitude},${stop.longitude}?q=${stop.latitude},${stop.longitude}(${query})`;
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`;

    try {
      await Linking.openURL(nativeUrl);
    } catch {
      try {
        await Linking.openURL(webUrl);
      } catch (error) {
        console.error('Unable to open maps:', error);
        Alert.alert('Unable to Open Maps', 'No maps app could be opened on this device.');
      }
    }
  };

  const handleRemoveStop = async () => {
    if (!onRemoveStop || !stop) return;

    // Prevent removing if it would leave less than the minimum number of stops
    if (totalStops <= MIN_STOPS_PER_ROUTE) {
      Alert.alert(
        'Cannot Remove Stop',
        'A route must have at least 2 stops. Add more stops before removing this one.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Confirm deletion
    Alert.alert(
      'Remove Stop?',
      `Are you sure you want to remove "${stop.name}" from your route?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await onRemoveStop(stop.id);
              onClose();
            } catch (error) {
              console.error('Error removing stop:', error);
              Alert.alert(
                'Error',
                'Failed to remove stop. Please try again.',
                [{ text: 'OK' }]
              );
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.dismissArea}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.modalContainer, { maxHeight: maxModalHeight, paddingBottom: bottomPadding }]}>
          <ThemedView style={[styles.modal, { backgroundColor: colors.background }]}>
            {/* Hero Image */}
            {heroPhoto && (
              <View style={styles.heroImageContainer}>
                <Image
                  source={buildDisplayPhotoSource(heroPhoto, `${Math.round(screenWidth)}x${HERO_IMAGE_HEIGHT * 2}`)}
                  style={styles.heroImage}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.heroOverlay} />

                {/* Header buttons overlay */}
                <View style={styles.heroButtonsContainer}>
                  {/* Remove button - Left side */}
                  {canRemove && (
                    <TouchableOpacity
                      style={styles.removeButtonHero}
                      onPress={handleRemoveStop}
                      disabled={isRemovingStop}
                    >
                      <View style={[styles.heroButtonCircle, styles.removeButtonCircleHero]}>
                        {isRemovingStop ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <IconSymbol name="trash" size={18} color="#DC2626" />
                        )}
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Close button - Right side */}
                  <TouchableOpacity style={styles.closeButtonHero} onPress={onClose}>
                    <View style={styles.closeButtonCircle}>
                      <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Header (shown when no hero image) */}
            {!heroPhoto && (
              <View style={styles.header}>
                <View style={[styles.iconBadge, { backgroundColor: iconConfig.color }]}>
                  <IconSymbol name={iconConfig.icon} size={32} color="#FFFFFF" />
                </View>
                <View style={styles.headerButtons}>
                  {/* Remove button */}
                  {canRemove && (
                    <TouchableOpacity
                      style={[styles.removeButtonHeader, colorScheme === 'dark' && { backgroundColor: 'rgba(220, 38, 38, 0.12)' }]}
                      onPress={handleRemoveStop}
                      disabled={isRemovingStop}
                    >
                      {isRemovingStop ? (
                        <ActivityIndicator size="small" color="#DC2626" />
                      ) : (
                        <IconSymbol name="trash" size={20} color="#DC2626" />
                      )}
                    </TouchableOpacity>
                  )}
                  {/* Close button */}
                  <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Content */}
            <ScrollView
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.content}>
                {/* Title Row with Icon */}
                <View style={styles.titleRow}>
                  {heroPhoto && (
                    <View style={[styles.iconBadgeSmall, { backgroundColor: iconConfig.color }]}>
                      <IconSymbol name={iconConfig.icon} size={20} color="#FFFFFF" />
                    </View>
                  )}
                  <View style={styles.titleContainer}>
                    <ThemedText type="title" style={styles.title}>
                      {stop.name}
                    </ThemedText>
                    <ThemedText style={styles.subtitle}>
                      Stop {stop.order} of {totalStops} • {stop.type}
                    </ThemedText>
                  </View>
                </View>

                {/* Rating & Price Row */}
                {stop.venueDetails && (stop.venueDetails.rating || stop.venueDetails.price) && (
                  <View style={styles.ratingRow}>
                    {typeof stop.venueDetails.rating === 'number' && Number.isFinite(stop.venueDetails.rating) && (
                      <View style={[styles.ratingBadge, { backgroundColor: stop.venueDetails.ratingColor || '#666' }]}>
                        <ThemedText style={styles.ratingText}>
                          {stop.venueDetails.rating.toFixed(1)}
                        </ThemedText>
                        <ThemedText style={styles.ratingLabel}>/10</ThemedText>
                      </View>
                    )}
                    {typeof stop.venueDetails.price === 'number' && Number.isFinite(stop.venueDetails.price) && (
                      <View style={[styles.priceContainer, colorScheme === 'dark' && { backgroundColor: colors.surface }]}>
                        <ThemedText style={styles.priceText}>
                          {'$'.repeat(Math.min(4, Math.max(0, Math.round(stop.venueDetails.price))))}
                        </ThemedText>
                        <ThemedText style={styles.priceInactive}>
                          {'$'.repeat(Math.max(0, 4 - Math.min(4, Math.max(0, Math.round(stop.venueDetails.price)))))}
                        </ThemedText>
                      </View>
                    )}
                    {stop.venueDetails.verified && (
                      <View style={[styles.verifiedBadge, colorScheme === 'dark' && { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                        <IconSymbol name="checkmark.seal.fill" size={14} color="#10B981" />
                        <ThemedText style={styles.verifiedText}>Verified</ThemedText>
                      </View>
                    )}
                  </View>
                )}

                {/* Duration */}
                <View style={[styles.durationContainer, colorScheme === 'dark' && { backgroundColor: colors.surface }]}>
                  <IconSymbol name="clock.fill" size={16} color={mapColors.route.driving.main} />
                  <ThemedText style={styles.duration}>{stop.duration} minutes</ThemedText>
                </View>

                {/* Limited Data Indicator */}
                {stop.venueDetails?.provider === 'geocoding' && (
                  <View style={[styles.limitedDataBadge, colorScheme === 'dark' && { backgroundColor: 'rgba(217, 119, 6, 0.15)' }]}>
                    <IconSymbol name="info.circle" size={14} color="#D97706" />
                    <ThemedText style={[styles.limitedDataText, colorScheme === 'dark' && { color: '#FBBF24' }]}>
                      Limited venue details available
                    </ThemedText>
                  </View>
                )}

                {/* Description */}
                <ThemedText style={styles.description}>
                  {stop.description}
                </ThemedText>

                {/* Additional Photos */}
                {additionalPhotos.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.photoScroll}
                    contentContainerStyle={styles.photoScrollContent}
                  >
                    {additionalPhotos.map((photo, index) => (
                      <Image
                        key={index}
                        source={buildDisplayPhotoSource(photo, '200x150')}
                        style={[styles.thumbnailPhoto, colorScheme === 'dark' && { backgroundColor: colors.surface }]}
                        contentFit="cover"
                        transition={200}
                      />
                    ))}
                  </ScrollView>
                )}

                {/* Address Section */}
                <View style={[styles.addressSection, colorScheme === 'dark' && { backgroundColor: colors.surface }]}>
                  <View style={styles.addressHeader}>
                    <IconSymbol name="mappin.circle.fill" size={20} color={mapColors.route.driving.main} />
                    <ThemedText style={styles.addressLabel}>Address</ThemedText>
                  </View>
                  <ThemedText style={styles.addressStreet}>{addressParts.street}</ThemedText>
                  {addressParts.cityStateZip && (
                    <ThemedText style={styles.addressCityZip}>{addressParts.cityStateZip}</ThemedText>
                  )}
                </View>

                {/* Venue Hours */}
                {stop.venueDetails && (
                  <VenueHours
                    hours={stop.venueDetails.hours}
                    isOpen={stop.venueDetails.isOpen}
                  />
                )}

                {/* User Tips/Reviews */}
                {stop.venueDetails?.tips && stop.venueDetails.tips.length > 0 && (
                  <VenueTips tips={stop.venueDetails.tips} />
                )}
              </View>
            </ScrollView>

            {/* Action Buttons - Fixed at bottom, outside ScrollView */}
            <View style={[styles.directionsContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
              {/* Remove Stop Button - Always visible */}
              <TouchableOpacity
                style={[
                  styles.removeButton,
                  (isRemovingStop || !canRemove) && styles.removeButtonDisabled,
                  colorScheme === 'dark' && { backgroundColor: 'rgba(220, 38, 38, 0.12)' }
                ]}
                onPress={handleRemoveStop}
                activeOpacity={0.7}
                disabled={isRemovingStop || !canRemove}
              >
                {isRemovingStop ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <>
                    <IconSymbol name="trash" size={20} color={canRemove ? '#DC2626' : '#9CA3AF'} />
                    <ThemedText style={[
                      styles.removeButtonText,
                      !canRemove && styles.removeButtonTextDisabled
                    ]}>
                      {canRemove ? 'Remove Stop' : `Minimum ${MIN_STOPS_PER_ROUTE} Stops Required`}
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.directionsButton, { backgroundColor: mapColors.route.driving.main }]}
                onPress={handleGetDirections}
              >
                <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={20} color="#FFFFFF" />
                <ThemedText style={styles.directionsButtonText}>
                  Get Directions
                </ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    // maxHeight and paddingBottom set dynamically via inline style
    width: '100%',
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
    overflow: 'hidden',
  },
  heroImageContainer: {
    position: 'relative',
    width: '100%',
    height: HERO_IMAGE_HEIGHT,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  heroButtonsContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  removeButtonHero: {
    // Position handled by parent container
  },
  closeButtonHero: {
    // Position handled by parent container
  },
  closeButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonCircleHero: {
    backgroundColor: 'rgba(254, 242, 242, 0.95)', // Light red background
    borderWidth: 1.5,
    borderColor: '#DC2626',
  },
  scrollView: {
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 0,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  removeButtonHeader: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: '400',
  },
  content: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 13,
    opacity: 0.6,
    textTransform: 'capitalize',
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
    marginTop: 2,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  ratingLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 1,
  },
  priceContainer: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },
  priceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
  },
  priceInactive: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D1D5DB',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  duration: {
    fontSize: 14,
    fontWeight: '600',
  },
  limitedDataBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  limitedDataText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#92400E',
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
  },
  photoScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  photoScrollContent: {
    gap: 10,
    paddingVertical: 4,
  },
  thumbnailPhoto: {
    width: 140,
    height: 100,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  addressSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  addressLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressStreet: {
    fontSize: 16,
    fontWeight: '600',
  },
  addressCityZip: {
    fontSize: 15,
  },
  directionsContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
    minHeight: 52,
  },
  removeButtonDisabled: {
    opacity: 0.6,
  },
  removeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
  removeButtonTextDisabled: {
    color: '#9CA3AF',
  },
  directionsButton: {
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  directionsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
