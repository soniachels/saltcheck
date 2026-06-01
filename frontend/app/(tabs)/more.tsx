import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/appStore';

export default function MoreScreen() {
  const router = useRouter();
  const { user } = useAppStore();

  const MenuItem = ({ title, subtitle, icon, onPress }: any) => (
    <TouchableOpacity onPress={onPress}>
      <Card variant="default">
        <View style={styles.menuItem}>
          <View style={styles.menuIcon}>
            <Ionicons name={icon} size={24} color={Colors.pepperRed} />
          </View>
          <View style={styles.menuContent}>
            <Text style={styles.menuTitle}>{title}</Text>
            {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={24} color={Colors.steelBlueGrey} />
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hey there</Text>
        <Text style={styles.subtitle}>More tools for managing the chaos</Text>
      </View>

      <MenuItem
        title="Body Notes"
        subtitle="Track sleep, symptoms, and body stuff"
        icon="fitness"
        onPress={() => router.push('/body-notes')}
      />

      <MenuItem
        title="Receipts"
        subtitle="Private people and power notes"
        icon="lock-closed"
        onPress={() => router.push('/receipts')}
      />

      <MenuItem
        title="PEPPER History"
        subtitle="Past check-ins and plans"
        icon="time"
        onPress={() => router.push('/pepper-history')}
      />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <Card variant="default">
          <Text style={styles.aboutText}>Salt Check v1.0</Text>
          <Text style={styles.aboutSubtext}>Developed by saltylabz</Text>
          <Text style={styles.aboutSubtext}>Managed by PEPPER</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Layout.screenPadding,
    paddingBottom: 100,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  greeting: {
    fontSize: Typography.fontSize.xxl,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.steelBlueGrey,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.darkGreen,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: Typography.fontSize.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.steelBlueGrey,
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.pepperRed,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  aboutText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  aboutSubtext: {
    fontSize: Typography.fontSize.sm,
    color: Colors.steelBlueGrey,
    marginBottom: Spacing.xs,
  },
});