import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ValidationWarning } from '@/types/validation';

interface ValidationAlertProps {
  warnings: ValidationWarning[];
}

export function ValidationAlert({ warnings }: ValidationAlertProps) {
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
          <Text style={styles.sectionTitle}>⚠️ Errors</Text>
          {errors.map((warning, index) => (
            <ValidationWarningItem key={index} warning={warning} />
          ))}
        </View>
      )}

      {warningsOnly.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Warnings</Text>
          {warningsOnly.map((warning, index) => (
            <ValidationWarningItem key={index} warning={warning} />
          ))}
        </View>
      )}

      {info.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ Info</Text>
          {info.map((warning, index) => (
            <ValidationWarningItem key={index} warning={warning} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ValidationWarningItem({ warning }: { warning: ValidationWarning }) {
  const backgroundColor = {
    error: '#fee2e2',
    warning: '#fef3c7',
    info: '#dbeafe',
  }[warning.severity];

  const textColor = {
    error: '#991b1b',
    warning: '#92400e',
    info: '#1e40af',
  }[warning.severity];

  return (
    <View style={[styles.warningItem, { backgroundColor }]}>
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
    color: '#111827',
  },
  warningItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
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
