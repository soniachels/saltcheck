import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Layout } from '../theme';

interface CategoryCardProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  badge?: string; // e.g. "P" or "R" or "2 overdue"
  variant?: 'dark' | 'lilac' | 'lime' | 'red';
  onPress?: () => void;
  rightSlot?: React.ReactNode;
  large?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
  testID?: string;
}

/**
 * The signature card from the onboarding mockups: rounded squircle,
 * optional small icon chip or single-letter badge, big bold title.
 */
export const CategoryCard: React.FC<CategoryCardProps> = ({
  title,
  subtitle,
  icon,
  badge,
  variant = 'dark',
  onPress,
  rightSlot,
  large = false,
  style,
  children,
  testID,
}) => {
  const variantStyle =
    variant === 'lilac'
      ? styles.lilac
      : variant === 'lime'
      ? styles.lime
      : variant === 'red'
      ? styles.red
      : styles.dark;

  const textColor =
    variant === 'lilac' || variant === 'lime' ? Colors.inkBlack : Colors.text;
  const subColor =
    variant === 'lilac' || variant === 'lime'
      ? 'rgba(13,13,13,0.55)'
      : Colors.textSubtle;

  const Wrapper: any = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      style={[styles.card, variantStyle, large && styles.cardLarge, style]}
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      testID={testID}
    >
      <View style={styles.row}>
        {icon && (
          <View
            style={[
              styles.iconChip,
              variant === 'dark' && styles.iconChipDark,
              (variant === 'lilac' || variant === 'lime') && styles.iconChipLight,
            ]}
          >
            <Ionicons
              name={icon}
              size={20}
              color={
                variant === 'lilac' || variant === 'lime'
                  ? Colors.inkBlack
                  : Colors.saltBone
              }
            />
          </View>
        )}
        {badge && !icon && (
          <View
            style={[
              styles.iconChip,
              variant === 'dark' && styles.iconChipDark,
              (variant === 'lilac' || variant === 'lime') && styles.iconChipLight,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: variant === 'lilac' || variant === 'lime' ? Colors.inkBlack : Colors.saltBone },
              ]}
            >
              {badge}
            </Text>
          </View>
        )}

        <View style={styles.body}>
          <Text style={[styles.title, { color: textColor }, large && styles.titleLarge]}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: subColor }]}>{subtitle}</Text>
          )}
        </View>

        {rightSlot && <View style={styles.rightSlot}>{rightSlot}</View>}
      </View>

      {children && <View style={styles.children}>{children}</View>}
    </Wrapper>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    padding: Layout.cardPaddingLarge,
    marginBottom: Spacing.md,
  },
  cardLarge: {
    padding: Spacing.lg,
  },
  dark: {
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lilac: {
    backgroundColor: Colors.softSpiceLilac,
  },
  lime: {
    backgroundColor: Colors.pickleLime,
  },
  red: {
    backgroundColor: Colors.brightRed,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  iconChipDark: {
    backgroundColor: Colors.inkBlack,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconChipLight: {
    backgroundColor: 'rgba(13,13,13,0.1)',
  },
  badgeText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '900',
    letterSpacing: 1,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  titleLarge: {
    fontSize: Typography.fontSize.xxl,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: '500',
  },
  rightSlot: {
    marginLeft: Spacing.sm,
  },
  children: {
    marginTop: Spacing.md,
  },
});
