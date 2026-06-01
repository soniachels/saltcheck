import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Layout, BorderRadius, Spacing } from '../theme';

interface PepperBubbleProps {
  children: React.ReactNode;
  label?: string; // e.g. "PEPPER" or "* PEPPER IS READING..."
  variant?: 'red' | 'lilac' | 'lime' | 'dark';
  small?: boolean;
  style?: ViewStyle;
}

/**
 * Speech bubble for PEPPER's voice. Solid colored rounded rectangle with
 * uppercase label. Matches the onboarding card aesthetic.
 */
export const PepperBubble: React.FC<PepperBubbleProps> = ({
  children,
  label,
  variant = 'red',
  small = false,
  style,
}) => {
  const bgStyle =
    variant === 'red'
      ? styles.red
      : variant === 'lilac'
      ? styles.lilac
      : variant === 'lime'
      ? styles.lime
      : styles.dark;

  const textColor =
    variant === 'red'
      ? Colors.saltBone
      : variant === 'dark'
      ? Colors.saltBone
      : Colors.inkBlack;

  return (
    <View style={[styles.bubble, bgStyle, small && styles.small, style]}>
      {label && (
        <Text style={[styles.label, { color: textColor, opacity: 0.7 }]}>
          {label}
        </Text>
      )}
      <Text style={[styles.text, { color: textColor }, small && styles.textSmall]}>
        {children}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    borderRadius: BorderRadius.xl,
    padding: Layout.cardPaddingLarge,
    marginBottom: Spacing.md,
  },
  small: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  red: {
    backgroundColor: Colors.brightRed,
  },
  lilac: {
    backgroundColor: Colors.softSpiceLilac,
  },
  lime: {
    backgroundColor: Colors.pickleLime,
  },
  dark: {
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  text: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    lineHeight: Typography.fontSize.lg * 1.4,
  },
  textSmall: {
    fontSize: Typography.fontSize.base,
    lineHeight: Typography.fontSize.base * 1.5,
  },
});
