import { View, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Route } from '@/types/route';

interface RouteSummaryProps {
  route: Route;
  onSave: () => void;
  onRegenerate: () => void;
}

export function RouteSummary({ route, onSave, onRegenerate }: RouteSummaryProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Older saved routes may have stops without a duration; treat those as 0 rather than NaN.
  const totalDuration = route.stops.reduce(
    (sum, stop) => sum + (Number.isFinite(stop.duration) ? stop.duration : 0),
    0
  );
  const hours = Math.floor(totalDuration / 60);
  const minutes = totalDuration % 60;
  const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  // Calculate validation statistics
  const verifiedCount = route.stops.filter((s) => s.validationStatus === 'verified').length;
  const geocodedCount = route.stops.filter((s) => s.validationStatus === 'geocoded').length;
  const approximateCount = route.stops.filter(
    (s) => s.validationStatus === 'approximated' || s.validationStatus === 'fallback'
  ).length;

  const handleShare = async () => {
    try {
      const sortedStops = [...route.stops].sort((a, b) => a.order - b.order);

      const stopsList = sortedStops
        .map(
          (stop, idx) =>
            `${idx + 1}. ${stop.name} (${stop.type})\n   ${stop.address}\n   ${stop.duration} min`
        )
        .join('\n\n');

      let mapsUrl = '';
      if (sortedStops.length >= 2) {
        const first = sortedStops[0];
        const last = sortedStops[sortedStops.length - 1];
        const middle = sortedStops.slice(1, -1);
        const origin = `${first.latitude},${first.longitude}`;
        const destination = `${last.latitude},${last.longitude}`;
        mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
        if (middle.length > 0) {
          const waypoints = middle.map(s => `${s.latitude},${s.longitude}`).join('|');
          mapsUrl += `&waypoints=${encodeURIComponent(waypoints)}`;
        }
      } else if (sortedStops.length === 1) {
        const stop = sortedStops[0];
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`;
      }

      const message = `${route.title}\n\n${stopsList}${mapsUrl ? `\n\nView in Google Maps:\n${mapsUrl}` : ''}`;

      await Share.share({
        message,
        title: route.title,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <ThemedView style={[styles.container, { borderBottomColor: colors.border }]}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          {route.title}
        </ThemedText>

        {/* Validation badges row with meta info on right */}
        <View style={styles.badgesRow}>
          <View style={styles.validationBadges}>
            {verifiedCount > 0 && (
              <View style={[styles.badge, styles.verifiedBadge, colorScheme === 'dark' && { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <ThemedText style={styles.badgeText}>✓ {verifiedCount} verified</ThemedText>
              </View>
            )}
            {geocodedCount > 0 && (
              <View style={[styles.badge, styles.geocodedBadge, colorScheme === 'dark' && { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <ThemedText style={styles.badgeText}>◉ {geocodedCount} geocoded</ThemedText>
              </View>
            )}
            {approximateCount > 0 && (
              <View style={[styles.badge, styles.approximateBadge, colorScheme === 'dark' && { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <ThemedText style={styles.badgeText}>~ {approximateCount} approximate</ThemedText>
              </View>
            )}
          </View>

          <View style={styles.metaContainer}>
            <ThemedText style={styles.meta}>
              ⭐ {route.stops.length} stops • {durationText}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.tint }]}
          onPress={onSave}
        >
          <ThemedText style={styles.actionButtonText}>Save</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { borderColor: colors.icon, borderWidth: 1 }]}
          onPress={handleShare}
        >
          <ThemedText style={styles.actionButtonTextSecondary}>Share</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { borderColor: colors.icon, borderWidth: 1 }]}
          onPress={onRegenerate}
        >
          <ThemedText style={styles.actionButtonTextSecondary}>New Route</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 8,
  },
  meta: {
    fontSize: 14,
    opacity: 0.8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
  },
  validationBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  verifiedBadge: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  geocodedBadge: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  approximateBadge: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
