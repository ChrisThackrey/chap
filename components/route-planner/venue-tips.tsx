import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface VenueTipsProps {
  tips: string[];
}

export function VenueTips({ tips }: VenueTipsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  if (!tips || tips.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconSymbol name="quote.bubble.fill" size={18} color={colors.textSecondary} />
        <ThemedText style={styles.headerText}>What people say</ThemedText>
      </View>

      {tips.map((tip, index) => (
        <View key={index} style={styles.tipContainer}>
          <View style={styles.quoteMark}>
            <ThemedText style={styles.quoteText}>&ldquo;</ThemedText>
          </View>
          <ThemedText style={styles.tipText}>{tip}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tipContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 8,
  },
  quoteMark: {
    marginTop: -4,
  },
  quoteText: {
    fontSize: 24,
    fontWeight: '700',
    opacity: 0.3,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    fontStyle: 'italic',
  },
});
