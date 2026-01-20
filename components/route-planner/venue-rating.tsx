import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface VenueRatingProps {
  rating?: number;
  ratingColor?: string;
  price?: number;
  verified?: boolean;
}

export function VenueRating({ rating, ratingColor, price, verified }: VenueRatingProps) {
  if (!rating && !price && !verified) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Rating Badge */}
      {rating !== undefined && (
        <View
          style={[
            styles.ratingBadge,
            { backgroundColor: ratingColor || '#666' },
          ]}
        >
          <ThemedText style={styles.ratingText}>
            {rating.toFixed(1)}
          </ThemedText>
        </View>
      )}

      {/* Price Level */}
      {price !== undefined && (
        <View style={styles.priceContainer}>
          <ThemedText style={styles.priceText}>
            {'$'.repeat(price)}
            <ThemedText style={styles.priceInactive}>
              {'$'.repeat(Math.max(0, 4 - price))}
            </ThemedText>
          </ThemedText>
        </View>
      )}

      {/* Verified Badge */}
      {verified && (
        <View style={styles.verifiedBadge}>
          <IconSymbol name="checkmark.seal.fill" size={16} color="#00b551" />
          <ThemedText style={styles.verifiedText}>Verified</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  ratingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  priceContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '600',
  },
  priceInactive: {
    opacity: 0.3,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#e6f7ed',
    borderRadius: 6,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#00b551',
  },
});
