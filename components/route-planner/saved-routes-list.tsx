import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Route } from '@/types/route';
import { calculateTotalDistance, formatDistance } from '@/lib/route-utils';

interface SavedRoutesListProps {
  routes: Route[];
  onSelectRoute: (route: Route) => void;
  onDeleteRoute: (routeId: string) => void;
  loading?: boolean;
}

export function SavedRoutesList({
  routes,
  onSelectRoute,
  onDeleteRoute,
  loading,
}: SavedRoutesListProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            Saved Routes
          </ThemedText>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.tint} />
        </View>
      </View>
    );
  }

  if (routes.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            Saved Routes
          </ThemedText>
        </View>
        <View style={styles.emptyContainer}>
          <IconSymbol name="bookmark" size={32} color={colors.icon} />
          <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
            No saved routes yet
          </ThemedText>
          <ThemedText style={[styles.emptyHint, { color: colors.textSecondary }]}>
            Generate a route and tap Save to keep it here
          </ThemedText>
        </View>
      </View>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.headerTitle}>
          Saved Routes
        </ThemedText>
        <ThemedText style={[styles.routeCount, { color: colors.textSecondary }]}>
          {routes.length} {routes.length === 1 ? 'route' : 'routes'}
        </ThemedText>
      </View>

      <View style={styles.routesList}>
        {routes.map((route) => {
          const distance = calculateTotalDistance(route);
          const formattedDistance = formatDistance(distance);

          return (
            <View
              key={route.id}
              style={[styles.routeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <TouchableOpacity
                style={styles.routeContent}
                onPress={() => onSelectRoute(route)}
                activeOpacity={0.7}
              >
                <View style={styles.routeInfo}>
                  <ThemedText style={styles.routeTitle} numberOfLines={1}>
                    {route.title}
                  </ThemedText>
                  <ThemedText style={[styles.routeDate, { color: colors.textSecondary }]}>
                    {formatDate(route.createdAt)}
                  </ThemedText>
                </View>

                <View style={styles.badgesRow}>
                  <View style={[styles.badge, styles.filledBadge, { backgroundColor: colors.tint }]}>
                    <ThemedText style={styles.filledBadgeText}>
                      {route.stops.length} {route.stops.length === 1 ? 'stop' : 'stops'}
                    </ThemedText>
                  </View>
                  <View style={[styles.badge, styles.outlinedBadge, { borderColor: colors.tint }]}>
                    <ThemedText style={[styles.outlinedBadgeText, { color: colors.tint }]}>
                      {formattedDistance}
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => onDeleteRoute(route.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol name="trash" size={18} color={colors.icon} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
  },
  routeCount: {
    fontSize: 14,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
  },
  routesList: {
    gap: 12,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  routeContent: {
    flex: 1,
    padding: 12,
  },
  routeInfo: {
    marginBottom: 8,
  },
  routeTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  routeDate: {
    fontSize: 13,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  filledBadge: {
    // backgroundColor set dynamically
  },
  filledBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  outlinedBadge: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  outlinedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
