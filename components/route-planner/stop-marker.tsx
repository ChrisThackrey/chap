import { View, StyleSheet, Platform } from 'react-native';
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
    width: 50,
    height: 50,
    overflow: 'visible', // Prevent clipping of badge
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#1F2937',
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: Platform.OS === 'android' ? 13 : 11,
    textAlign: 'center',
    ...Platform.select({
      android: {
        textAlignVertical: 'center',
        includeFontPadding: false,
      },
    }),
  },
});
