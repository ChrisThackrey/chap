import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StopType } from '@/types/route';
import { getStopIcon } from '@/constants/stop-icons';

interface StopMarkerProps {
  type: StopType;
  stopNumber: number;
}

export function StopMarker({ type, stopNumber }: StopMarkerProps) {
  const iconConfig = getStopIcon(type);

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: iconConfig.color }]}>
        <IconSymbol
          name={iconConfig.ios as any}
          size={24}
          color="#FFFFFF"
        />
      </View>
      <View style={styles.badge}>
        <ThemedText style={styles.badgeText}>{stopNumber}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#000',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
