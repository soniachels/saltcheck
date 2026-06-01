import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Typography, Layout, Spacing } from '../src/theme';
import { Card } from '../src/components/Card';
import apiClient from '../src/services/api';
import { useAppStore } from '../src/store/appStore';

export default function PepperHistoryScreen() {
  const [history, setHistory] = useState<any[]>([]);
  const { currentUserId } = useAppStore();

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const response = await apiClient.get(`/pepper/history/${currentUserId}`);
      setHistory(response.data);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'PEPPER HISTORY', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>Past check-ins and plans</Text>
        </View>

        {history.length > 0 ? (
          history.map((item) => (
            <Card key={item.id} variant="pepper">
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
              <Text style={styles.quickRead}>{item.ai_response.quick_read}</Text>
              
              {item.ai_response.salt_check && item.ai_response.salt_check.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>SALT CHECK</Text>
                  {item.ai_response.salt_check.map((move: string, index: number) => (
                    <Text key={index} style={styles.listItem}>• {move}</Text>
                  ))}
                </View>
              )}
              
              <View style={styles.section}>
                <Text style={styles.nextStep}>→ {item.next_sane_step}</Text>
              </View>
            </Card>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No check-ins yet. Go talk to PEPPER.</Text>
          </View>
        )}
      </ScrollView>
    </>
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
  subtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.steelBlueGrey,
  },
  date: {
    fontSize: Typography.fontSize.sm,
    color: Colors.pepperRed,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  quickRead: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  section: {
    marginTop: Spacing.md,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.pepperRed,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  listItem: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  nextStep: {
    fontSize: Typography.fontSize.base,
    color: Colors.pickleLime,
    fontWeight: '600',
  },
  empty: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.steelBlueGrey,
    textAlign: 'center',
  },
});