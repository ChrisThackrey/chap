import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tailwind } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODAL_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 400);

interface AddStopModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
}

export function AddStopModal({
  visible,
  onClose,
  onSubmit,
  isLoading,
  error,
  onClearError,
}: AddStopModalProps) {
  const [prompt, setPrompt] = useState('');

  // Reset prompt when modal opens
  useEffect(() => {
    if (visible) {
      setPrompt('');
      onClearError();
    }
  }, [visible, onClearError]);

  const handleSubmit = () => {
    if (prompt.trim() && !isLoading) {
      onSubmit(prompt.trim());
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setPrompt('');
      onClearError();
      onClose();
    }
  };

  const handleTextChange = (text: string) => {
    if (error) {
      onClearError();
    }
    setPrompt(text);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <TouchableWithoutFeedback>
              <View style={styles.modalContainer}>
                {/* Header */}
                <View style={styles.header}>
                  <ThemedText style={styles.title}>Add a Stop</ThemedText>
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeButton}
                    disabled={isLoading}
                  >
                    <IconSymbol name="xmark" size={20} color={tailwind.gray500} />
                  </TouchableOpacity>
                </View>

                {/* Description */}
                <ThemedText style={styles.description}>
                  Describe the type of place you want to add
                </ThemedText>

                {/* Text Input */}
                <TextInput
                  style={styles.input}
                  placeholder="e.g., a rooftop bar with views, a cozy coffee shop..."
                  placeholderTextColor={tailwind.gray400}
                  value={prompt}
                  onChangeText={handleTextChange}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                  editable={!isLoading}
                  textAlignVertical="top"
                />

                {/* Character count */}
                <ThemedText style={styles.charCount}>
                  {prompt.length}/200
                </ThemedText>

                {/* Error display */}
                {error && (
                  <View style={styles.errorContainer}>
                    <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#EF4444" />
                    <ThemedText style={styles.errorText}>{error}</ThemedText>
                  </View>
                )}

                {/* Submit button */}
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    (!prompt.trim() || isLoading) && styles.submitButtonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!prompt.trim() || isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <ThemedText style={styles.submitButtonText}>Finding venue...</ThemedText>
                    </>
                  ) : (
                    <>
                      <IconSymbol name="sparkles" size={18} color="#FFFFFF" />
                      <ThemedText style={styles.submitButtonText}>Find & Add</ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalContainer: {
    width: MODAL_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: tailwind.gray900,
  },
  closeButton: {
    padding: 4,
  },
  description: {
    fontSize: 14,
    color: tailwind.gray500,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: tailwind.gray200,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: tailwind.gray900,
    backgroundColor: tailwind.gray50,
    minHeight: 80,
    maxHeight: 120,
  },
  charCount: {
    fontSize: 12,
    color: tailwind.gray400,
    textAlign: 'right',
    marginTop: 6,
    marginBottom: 12,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tailwind.red50,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: tailwind.red600,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tailwind.blue500,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  submitButtonDisabled: {
    backgroundColor: tailwind.gray300,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
