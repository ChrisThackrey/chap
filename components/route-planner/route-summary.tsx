import { View, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
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

  const totalDuration = route.stops.reduce((sum, stop) => sum + stop.duration, 0);
  const hours = Math.floor(totalDuration / 60);
  const minutes = totalDuration % 60;
  const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  const handleShare = async () => {
    try {
      const message = `${route.title}\n\n${route.stops
        .map(
          (stop, idx) =>
            `${idx + 1}. ${stop.name} (${stop.type})\n   ${stop.address}\n   ${stop.duration} min`
        )
        .join('\n\n')}`;

      await Share.share({
        message,
        title: route.title,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleSave = () => {
    onSave();
    Alert.alert('Saved!', 'Route saved to your history');
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          {route.title}
        </ThemedText>

        <View style={styles.metaContainer}>
          <ThemedText style={styles.meta}>
            ⭐ {route.stops.length} stops • {durationText}
          </ThemedText>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.tint }]}
          onPress={handleSave}
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
    padding: 16,
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
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
