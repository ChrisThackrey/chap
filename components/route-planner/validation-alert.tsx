import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ValidationWarning } from '@/types/validation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

const severityColors = {
  light: {
    error: { background: '#fee2e2', text: '#991b1b' },
    warning: { background: '#fef3c7', text: '#92400e' },
    info: { background: '#dbeafe', text: '#1e40af' },
  },
  dark: {
    error: { background: '#451a1a', text: '#fca5a5' },
    warning: { background: '#451a03', text: '#fcd34d' },
    info: { background: '#1e3a5f', text: '#93c5fd' },
  },
};

interface ValidationAlertProps {
  warnings: ValidationWarning[];
}

export function ValidationAlert({ warnings }: ValidationAlertProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const severityMap = severityColors[colorScheme];

  if (warnings.length === 0) {
    return null;
  }

  // Group warnings by severity
  const errors = warnings.filter((w) => w.severity === 'error');
  const warningsOnly = warnings.filter((w) => w.severity === 'warning');
  const info = warnings.filter((w) => w.severity === 'info');

  return (
    <ScrollView style={styles.container}>
      {errors.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>⚠️ Errors</Text>
          {errors.map((warning, index) => (
            <ValidationWarningItem key={index} warning={warning} severityMap={severityMap} borderColor={colors.border} />
          ))}
        </View>
      )}

      {warningsOnly.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>⚡ Warnings</Text>
          {warningsOnly.map((warning, index) => (
            <ValidationWarningItem key={index} warning={warning} severityMap={severityMap} borderColor={colors.border} />
          ))}
        </View>
      )}

      {info.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>ℹ️ Info</Text>
          {info.map((warning, index) => (
            <ValidationWarningItem key={index} warning={warning} severityMap={severityMap} borderColor={colors.border} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ValidationWarningItem({ warning, severityMap, borderColor }: {
  warning: ValidationWarning;
  severityMap: typeof severityColors.light;
  borderColor: string;
}) {
  const { background: backgroundColor, text: textColor } = severityMap[warning.severity];

  return (
    <View style={[styles.warningItem, { backgroundColor, borderColor }]}>
      {warning.stopName && (
        <Text style={[styles.stopName, { color: textColor }]}>
          Stop {warning.stopIndex !== undefined ? warning.stopIndex + 1 : ''}: {warning.stopName}
        </Text>
      )}
      <Text style={[styles.message, { color: textColor }]}>{warning.message}</Text>
      {warning.suggestedAction && (
        <Text style={[styles.action, { color: textColor }]}>
          💡 {warning.suggestedAction}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    maxHeight: 300,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  warningItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  stopName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  action: {
    fontSize: 13,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
