import React from 'react';
import { TextInput, StyleSheet, View, Text, TextInputProps } from 'react-native';
import { Colors, Typography, Layout, BorderRadius } from '../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  style,
  ...props
}) => {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={Colors.steelBlueGrey}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {helperText && !error && <Text style={styles.helper}>{helperText}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Layout.componentGap,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: Layout.inputHeight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Layout.screenPadding,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: Colors.charcoal,
  },
  inputError: {
    borderColor: Colors.pepperRed,
  },
  error: {
    fontSize: Typography.fontSize.xs,
    color: Colors.pepperRed,
    marginTop: 4,
  },
  helper: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
    marginTop: 4,
  },
});