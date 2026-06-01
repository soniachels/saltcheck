import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { CategoryCard } from '../../src/components/CategoryCard';
import { useAppStore } from '../../src/store/appStore';

export default function MoreScreen() {
  const router = useRouter();
  const { nickname, pepperSpiceLevel } = useAppStore();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>* MORE</Text>
          <Text style={styles.heroTitle}>{nickname ? `hey ${nickname.toLowerCase()}.` : 'more tools.'}</Text>
          <Text style={styles.heroSub}>everything else lives here.</Text>
        </View>

        <CategoryCard
          title="Settings"
          subtitle={`spice: ${pepperSpiceLevel.replace('_', ' ')} · reminders · danger zone`}
          icon="settings"
          variant="dark"
          onPress={() => router.push('/settings')}
        />

        <CategoryCard
          title="PEPPER History"
          subtitle="past check-ins and plans"
          icon="time"
          variant="dark"
          onPress={() => router.push('/pepper-history')}
        />

        <View style={styles.about}>
          <Text style={styles.aboutTitle}>SALT CHECK v1.0</Text>
          <Text style={styles.aboutText}>by saltylabz</Text>
          <Text style={styles.aboutText}>managed by PEPPER</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Layout.screenPadding, paddingBottom: 100 },
  hero: { marginBottom: Spacing.xl },
  heroLabel: { fontSize: Typography.fontSize.xs, color: Colors.brightRed, fontWeight: '800', letterSpacing: 3, marginBottom: 6 },
  heroTitle: { fontSize: Typography.fontSize.display, fontWeight: '900', color: Colors.text, letterSpacing: 1 },
  heroSub: { fontSize: Typography.fontSize.base, color: Colors.textSubtle, fontStyle: 'italic', marginTop: 4 },
  about: { marginTop: Spacing.xxl, alignItems: 'center' },
  aboutTitle: { color: Colors.text, fontSize: Typography.fontSize.sm, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  aboutText: { color: Colors.textSubtle, fontSize: Typography.fontSize.xs, marginTop: 2 },
});
