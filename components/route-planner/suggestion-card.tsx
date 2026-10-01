import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { inferStopTypeFromGoogleTypes, GooglePlaceNew } from '@/lib/google-places';
import { getStopIcon } from '@/constants/stop-icons';
import { Colors, tailwind } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { StopType } from '@/types/route';

const DURATION_BY_TYPE: Record<StopType, number> = {
  restaurant: 90, cafe: 45, bar: 60, park: 45,
  museum: 90, theater: 120, viewpoint: 30, activity: 60, shopping: 60,
};

export function StarRating({ rating, count }: { rating?: number; count?: number }) {
  if (!rating || !Number.isFinite(rating)) return null;
  const clamped = Math.max(0, Math.min(5, rating));
  const full = Math.floor(clamped);
  const half = clamped - full >= 0.5;
  const stars: IconSymbolName[] = [];
  for (let i = 0; i < full; i++) stars.push('star.fill');
  if (half) stars.push('star.leadinghalf.filled');

  return (
    <View style={cardStyles.starsRow}>
      {stars.map((icon, i) => (
        <IconSymbol key={i} name={icon} size={12} color="#F59E0B" />
      ))}
      <ThemedText style={cardStyles.ratingText}>{rating.toFixed(1)}</ThemedText>
      {count != null && count > 0 && (
        <ThemedText style={cardStyles.reviewCount}>({count})</ThemedText>
      )}
    </View>
  );
}

interface SuggestionCardProps {
  place: GooglePlaceNew;
  onSelect: (place: GooglePlaceNew) => void;
  selectLabel?: string;
  nearestStopDistance?: number; // miles
  nearestStopName?: string;
  compact?: boolean;
}

function estimateTravelMinutes(distanceMiles: number): number {
  if (distanceMiles < 0.5) return Math.max(1, Math.ceil(distanceMiles * 15)); // ~4 mph walking
  return Math.max(1, Math.ceil(distanceMiles * 2)); // ~30 mph city driving
}

export function SuggestionCard({ place, onSelect, selectLabel, nearestStopDistance, compact }: SuggestionCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  if (!place.displayName?.text || !place.location ||
      typeof place.location.latitude !== 'number' ||
      typeof place.location.longitude !== 'number' ||
      (place.location.latitude === 0 && place.location.longitude === 0)) {
    return null;
  }
  const stopType = inferStopTypeFromGoogleTypes(place.types || []);
  const iconConfig = getStopIcon(stopType);
  const estimatedDuration = DURATION_BY_TYPE[stopType] || 60;
  const isOpen = place.currentOpeningHours?.openNow ?? place.regularOpeningHours?.openNow;

  return (
    <TouchableOpacity
      style={[
        cardStyles.card,
        { backgroundColor: colors.surface },
        compact && { shadowOpacity: 0, elevation: 0, borderWidth: 1, borderColor: colors.border },
      ]}
      onPress={() => onSelect(place)}
      activeOpacity={0.7}
    >
      {/* Header row: icon + name + type badge */}
      <View style={cardStyles.headerRow}>
        <View style={[cardStyles.iconCircle, { backgroundColor: iconConfig.color + '18' }]}>
          <IconSymbol name={iconConfig.icon} size={22} color={iconConfig.color} />
        </View>
        <View style={cardStyles.headerText}>
          <ThemedText style={cardStyles.name} numberOfLines={1}>
            {place.displayName.text}
          </ThemedText>
          <ThemedText style={cardStyles.address} numberOfLines={2}>
            {place.formattedAddress || ''}
          </ThemedText>
        </View>
      </View>

      {/* Meta row: rating, open/closed, duration */}
      <View style={cardStyles.metaRow}>
        <StarRating rating={place.rating} count={place.userRatingCount} />

        {isOpen != null && (
          <View style={[
            cardStyles.openBadge,
            { backgroundColor: isOpen
                ? (colorScheme === 'dark' ? 'rgba(22, 163, 74, 0.15)' : '#dcfce7')
                : (colorScheme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#fee2e2')
            },
          ]}>
            <View style={[
              cardStyles.openDot,
              { backgroundColor: isOpen ? '#16a34a' : '#dc2626' },
            ]} />
            <ThemedText style={[
              cardStyles.openText,
              { color: isOpen ? '#16a34a' : '#dc2626' },
            ]}>
              {isOpen ? 'Open' : 'Closed'}
            </ThemedText>
          </View>
        )}

        <View style={cardStyles.durationBadge}>
          {nearestStopDistance != null ? (
            <>
              <IconSymbol name="car" size={12} color={tailwind.gray500} />
              <ThemedText style={cardStyles.durationText}>
                {estimateTravelMinutes(nearestStopDistance)} min away
              </ThemedText>
            </>
          ) : (
            <>
              <IconSymbol name="clock" size={12} color={tailwind.gray500} />
              <ThemedText style={cardStyles.durationText}>
                ~{estimatedDuration} min visit
              </ThemedText>
            </>
          )}
        </View>
      </View>

      {/* Select indicator */}
      <View style={[cardStyles.selectRow, { borderTopColor: colors.border }]}>
        <ThemedText style={cardStyles.selectText}>
          {selectLabel || 'Tap to add this stop'}
        </ThemedText>
        <IconSymbol name="plus.circle.fill" size={22} color={tailwind.blue500} />
      </View>
    </TouchableOpacity>
  );
}

export const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  address: {
    fontSize: 13,
    color: tailwind.gray500,
    marginTop: 2,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  reviewCount: {
    fontSize: 12,
    color: tailwind.gray400,
    marginLeft: 2,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  openText: {
    fontSize: 12,
    fontWeight: '600',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    fontSize: 13,
    color: tailwind.gray500,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tailwind.gray100,
    paddingTop: 12,
  },
  selectText: {
    fontSize: 13,
    color: tailwind.gray400,
  },
});
