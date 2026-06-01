import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';

interface ChipPickerProps {
  label?: string;
  options: string[];
  value?: string | null;
  onChange: (v: string) => void;
  allowOther?: boolean;
  onOther?: () => void;
  variant?: 'lilac' | 'lime' | 'red';
  testIDPrefix?: string;
}

/**
 * Horizontal scrollable chip selector for picking from preset options.
 * Tap a chip to select; tapping the active one keeps it selected.
 * Optional "Other" chip triggers an onOther callback so the parent can
 * open a custom text input flow.
 */
export const ChipPicker: React.FC<ChipPickerProps> = ({
  label,
  options,
  value,
  onChange,
  allowOther = false,
  onOther,
  variant = 'lilac',
  testIDPrefix = 'chip',
}) => {
  const activeBg =
    variant === 'lime'
      ? Colors.pickleLime
      : variant === 'red'
      ? Colors.brightRed
      : Colors.softSpiceLilac;
  const activeText =
    variant === 'red' ? Colors.saltBone : Colors.inkBlack;

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {options.map((opt) => {
          const isActive = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[
                styles.chip,
                isActive && { backgroundColor: activeBg, borderColor: activeBg },
              ]}
              onPress={() => onChange(opt)}
              testID={`${testIDPrefix}-${opt.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Text
                style={[
                  styles.chipText,
                  isActive && { color: activeText },
                ]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
        {allowOther && (
          <TouchableOpacity
            style={[styles.chip, styles.chipOther]}
            onPress={onOther}
            testID={`${testIDPrefix}-other`}
          >
            <Text style={[styles.chipText, { color: Colors.textSubtle }]}>+ other</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.md },
  label: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSubtle,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  row: { gap: Spacing.xs, paddingRight: Spacing.md },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.xs,
  },
  chipOther: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  chipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    fontWeight: '600',
  },
});
