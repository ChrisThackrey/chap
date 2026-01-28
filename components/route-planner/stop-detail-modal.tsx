import { Modal, View, TouchableOpacity, StyleSheet, Linking, Platform, ScrollView, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, MapColors } from '@/constants/theme';
import { RouteStop } from '@/types/route';
import { getStopIcon } from '@/constants/stop-icons';
import { buildPhotoUrl } from '@/lib/foursquare';
import { VenueHours } from './venue-hours';
import { VenueTips } from './venue-tips';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_IMAGE_HEIGHT = 180;
const BOTTOM_SAFE_AREA = 90; // Tab bar + safe area padding

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
}

export function StopDetailModal({ stop, totalStops, visible, onClose }: StopDetailModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (!stop) return null;

  const iconConfig = getStopIcon(stop.type);
  const addressParts = parseAddress(stop.address);
  const heroPhoto = stop.venueDetails?.photos?.[0];
  const additionalPhotos = stop.venueDetails?.photos?.slice(1) || [];

  const handleGetDirections = () => {
    const address = encodeURIComponent(stop.address);
    const url =
      Platform.OS === 'ios'
        ? `maps://maps.apple.com/?q=${address}`
        : `geo:0,0?q=${address}`;

    Linking.openURL(url).catch(() => {
      // Fallback to Google Maps web
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`);
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.modalContainer}
        >
          <ThemedView style={[styles.modal, { backgroundColor: colors.background }]}>
            {/* Hero Image */}
            {heroPhoto && (
              <View style={styles.heroImageContainer}>
                <Image
                  source={{ uri: buildPhotoUrl(heroPhoto, `${Math.round(SCREEN_WIDTH)}x${HERO_IMAGE_HEIGHT * 2}`) }}
                  style={styles.heroImage}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.heroOverlay} />
                <TouchableOpacity style={styles.closeButtonHero} onPress={onClose}>
                  <View style={styles.closeButtonCircle}>
                    <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Header (shown when no hero image) */}
            {!heroPhoto && (
              <View style={styles.header}>
                <View style={[styles.iconBadge, { backgroundColor: iconConfig.color }]}>
                  <IconSymbol
                    name={iconConfig.ios as any}
                    size={32}
                    color="#FFFFFF"
                  />
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                </TouchableOpacity>
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
                      <IconSymbol name={iconConfig.ios as any} size={20} color="#FFFFFF" />
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
                    {stop.venueDetails.rating !== undefined && (
                      <View style={[styles.ratingBadge, { backgroundColor: stop.venueDetails.ratingColor || '#666' }]}>
                        <ThemedText style={styles.ratingText}>
                          {stop.venueDetails.rating.toFixed(1)}
                        </ThemedText>
                        <ThemedText style={styles.ratingLabel}>/10</ThemedText>
                      </View>
                    )}
                    {stop.venueDetails.price !== undefined && (
                      <View style={styles.priceContainer}>
                        <ThemedText style={styles.priceText}>
                          {'$'.repeat(stop.venueDetails.price)}
                        </ThemedText>
                        <ThemedText style={styles.priceInactive}>
                          {'$'.repeat(Math.max(0, 4 - stop.venueDetails.price))}
                        </ThemedText>
                      </View>
                    )}
                    {stop.venueDetails.verified && (
                      <View style={styles.verifiedBadge}>
                        <IconSymbol name="checkmark.seal.fill" size={14} color="#10B981" />
                        <ThemedText style={styles.verifiedText}>Verified</ThemedText>
                      </View>
                    )}
                  </View>
                )}

                {/* Duration */}
                <View style={styles.durationContainer}>
                  <IconSymbol name="clock.fill" size={16} color={MapColors.route.driving.main} />
                  <ThemedText style={styles.duration}>{stop.duration} minutes</ThemedText>
                </View>

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
                        source={{ uri: buildPhotoUrl(photo, '200x150') }}
                        style={styles.thumbnailPhoto}
                        contentFit="cover"
                        transition={200}
                      />
                    ))}
                  </ScrollView>
                )}

                {/* Address Section */}
                <View style={styles.addressSection}>
                  <View style={styles.addressHeader}>
                    <IconSymbol name="mappin.circle.fill" size={20} color={MapColors.route.driving.main} />
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

                {/* Directions Button */}
                <TouchableOpacity
                  style={[styles.directionsButton, { backgroundColor: MapColors.route.driving.main }]}
                  onPress={handleGetDirections}
                >
                  <IconSymbol name="arrow.triangle.turn.up.right.diamond.fill" size={20} color="#FFFFFF" />
                  <ThemedText style={styles.directionsButtonText}>
                    Get Directions
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </ThemedView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '75%',
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
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
  closeButtonHero: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  closeButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    maxHeight: 450,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 0,
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
    color: '#374151',
  },
  content: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: BOTTOM_SAFE_AREA,
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
    color: '#374151',
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    color: '#4B5563',
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
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressStreet: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  addressCityZip: {
    fontSize: 15,
    color: '#4B5563',
  },
  directionsButton: {
    marginTop: 8,
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
