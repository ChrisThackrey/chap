import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface VenueHoursProps {
  hours?: string;
  isOpen?: boolean;
}

export function VenueHours({ hours, isOpen }: VenueHoursProps) {
  if (!hours && isOpen === undefined) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Open/Closed Status */}
      {isOpen !== undefined && (
        <View style={styles.statusContainer}>
          <IconSymbol
            name={isOpen ? 'clock.fill' : 'clock'}
            size={16}
            color={isOpen ? '#00b551' : '#ff6b6b'}
          />
          <ThemedText
            style={[
              styles.statusText,
              { color: isOpen ? '#00b551' : '#ff6b6b' },
            ]}
          >
            {isOpen ? 'Open now' : 'Closed'}
          </ThemedText>
        </View>
      )}

      {/* Hours Text */}
      {hours && (
        <ThemedText style={styles.hoursText}>
          {hours}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  hoursText: {
    fontSize: 13,
    opacity: 0.7,
    marginLeft: 22,
  },
});
