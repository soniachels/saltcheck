import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Layout, BorderRadius, Shadows } from '../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'pepper' | 'money' | 'body' | 'receipt' | 'parked';
}

export const Card: React.FC<CardProps> = ({ children, style, variant = 'default' }) => {
  return (
    <View
      style={[
        styles.card,
        variant === 'default' && styles.default,
        variant === 'pepper' && styles.pepper,
        variant === 'money' && styles.money,
        variant === 'body' && styles.body,
        variant === 'receipt' && styles.receipt,
        variant === 'parked' && styles.parked,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Layout.cardPadding,
    marginBottom: Layout.componentGap,
  },
  default: {
    backgroundColor: Colors.charcoal,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pepper: {
    backgroundColor: Colors.charcoal,
    borderWidth: 2,
    borderColor: Colors.pepperRed,
  },
  money: {
    backgroundColor: Colors.darkGreen,
    borderWidth: 1,
    borderColor: Colors.pickleLime,
  },
  body: {
    backgroundColor: Colors.charcoal,
    borderWidth: 1,
    borderColor: Colors.softSpiceLilac,
  },
  receipt: {
    backgroundColor: Colors.darkerGreen,
    borderWidth: 1,
    borderColor: Colors.steelBlueGrey,
  },
  parked: {
    backgroundColor: Colors.darkGreen,
    borderWidth: 1,
    borderColor: Colors.border,
    opacity: 0.7,
  },
});