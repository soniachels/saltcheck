import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../src/services/api';
import { useAppStore } from '../../src/store/appStore';
import { useRouter } from 'expo-router';

export default function TodayScreen() {
  const [todayEntry, setTodayEntry] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { currentUserId } = useAppStore();
  const router = useRouter();

  const loadTodayEntry = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await apiClient.get(`/daily-entries/${currentUserId}/${today}`);
      setTodayEntry(response.data);
    } catch (error) {
      // No entry for today yet
      console.log('No entry for today');
    }
  };

  useEffect(() => {
    loadTodayEntry();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTodayEntry();
    setRefreshing(false);
  };

  const toggleCheck = async (field: string, value: boolean) => {
    if (!todayEntry) return;
    
    try {
      const updated = { ...todayEntry, [field]: !value };
      await apiClient.put(`/daily-entries/${todayEntry.id}`, updated);
      setTodayEntry(updated);
    } catch (error) {
      console.error('Failed to update:', error);
    }
  };

  const CheckItem = ({ label, checked, field }: { label: string; checked: boolean; field: string }) => (
    <TouchableOpacity
      style={styles.checkItem}
      onPress={() => toggleCheck(field, checked)}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={20} color={Colors.inkBlack} />}
      </View>
      <Text style={[styles.checkLabel, checked && styles.checkLabelDone]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.pepperRed} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        <Text style={styles.tagline}>Clean slate. Let's not waste it.</Text>
      </View>

      {/* Next Sane Step */}
      {todayEntry?.next_sane_step && (
        <Card style={styles.nextStepCard}>
          <Text style={styles.nextStepLabel}>NEXT SANE STEP</Text>
          <Text style={styles.nextStep}>{todayEntry.next_sane_step}</Text>
        </Card>
      )}

      {/* Top Priorities */}
      {todayEntry?.top_priorities && todayEntry.top_priorities.length > 0 && (
        <Card variant="default">
          <Text style={styles.sectionLabel}>TOP 3. NOT TOP 47.</Text>
          {todayEntry.top_priorities.slice(0, 3).map((priority: string, index: number) => (
            <View key={index} style={styles.priorityItem}>
              <Text style={styles.priorityNumber}>{index + 1}</Text>
              <Text style={styles.priorityText}>{priority}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Daily Checklist */}
      <Card variant="default">
        <Text style={styles.sectionLabel}>SURVIVAL BASICS</Text>
        <CheckItem label="Water" checked={todayEntry?.water_checked || false} field="water_checked" />
        <CheckItem label="Food" checked={todayEntry?.food_checked || false} field="food_checked" />
        <CheckItem label="Hygiene/Shower" checked={todayEntry?.hygiene_checked || false} field="hygiene_checked" />
      </Card>

      {/* Quick Actions */}
      <Card variant="default">
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        
        {todayEntry?.work_action && (
          <View style={styles.actionItem}>
            <Text style={styles.actionLabel}>WORK:</Text>
            <Text style={styles.actionText}>{todayEntry.work_action}</Text>
          </View>
        )}
        
        {todayEntry?.money_action && (
          <View style={styles.actionItem}>
            <Text style={styles.actionLabel}>MONEY:</Text>
            <Text style={styles.actionText}>{todayEntry.money_action}</Text>
          </View>
        )}
        
        {todayEntry?.life_admin_action && (
          <View style={styles.actionItem}>
            <Text style={styles.actionLabel}>LIFE:</Text>
            <Text style={styles.actionText}>{todayEntry.life_admin_action}</Text>
          </View>
        )}
      </Card>

      {/* CTA to PEPPER */}
      {!todayEntry && (
        <TouchableOpacity
          style={styles.pepperCTA}
          onPress={() => router.push('/(tabs)/pepper-checkin')}
        >
          <Text style={styles.pepperCTAText}>No plan yet. Let PEPPER sort it.</Text>
          <Ionicons name="arrow-forward" size={24} color={Colors.saltBone} />
        </TouchableOpacity>
      )}
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
  date: {
    fontSize: Typography.fontSize.xxl,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  tagline: {
    fontSize: Typography.fontSize.sm,
    color: Colors.steelBlueGrey,
  },
  nextStepCard: {
    backgroundColor: Colors.pepperRed,
    borderWidth: 2,
    borderColor: Colors.brightRed,
  },
  nextStepLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.saltBone,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  nextStep: {
    fontSize: Typography.fontSize.lg,
    color: Colors.saltBone,
    fontWeight: '600',
    lineHeight: Typography.fontSize.lg * 1.5,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.pepperRed,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  priorityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  priorityNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.pickleLime,
    color: Colors.inkBlack,
    fontSize: Typography.fontSize.md,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: Spacing.sm,
  },
  priorityText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: Typography.fontSize.base * 1.5,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.steelBlueGrey,
    marginRight: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.pickleLime,
    borderColor: Colors.pickleLime,
  },
  checkLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  checkLabelDone: {
    textDecorationLine: 'line-through',
    color: Colors.steelBlueGrey,
  },
  actionItem: {
    marginBottom: Spacing.md,
  },
  actionLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.pepperRed,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  actionText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: Typography.fontSize.base * 1.5,
  },
  pepperCTA: {
    backgroundColor: Colors.pepperRed,
    borderRadius: BorderRadius.lg,
    padding: Layout.cardPadding,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  pepperCTAText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    color: Colors.saltBone,
  },
});