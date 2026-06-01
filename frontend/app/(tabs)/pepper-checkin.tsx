import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import apiClient from '../../src/services/api';
import { useAppStore } from '../../src/store/appStore';

export default function PepperCheckinScreen() {
  const [rawDump, setRawDump] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const { currentUserId } = useAppStore();

  const handleCheckin = async () => {
    if (!rawDump.trim()) return;

    setLoading(true);
    try {
      const result = await apiClient.post('/pepper/checkin', {
        raw_dump: rawDump,
      }, {
        params: { user_id: currentUserId },
      });
      
      setResponse(result.data);
      setRawDump('');
    } catch (error) {
      console.error('PEPPER is taking a break:', error);
      alert('PEPPER is taking a break. Try again?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Trust Signal */}
        <View style={styles.trustSignal}>
          <Text style={styles.trustText}>Your dump is private. You choose what gets saved.</Text>
        </View>

        {/* Input Box */}
        <Card variant="pepper">
          <Text style={styles.label}>DUMP EVERYTHING</Text>
          <TextInput
            style={styles.input}
            placeholder="Tasks, money, body, people, bullshit. I'll sort it."
            placeholderTextColor={Colors.steelBlueGrey}
            value={rawDump}
            onChangeText={setRawDump}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
          />
          <Button
            title={loading ? 'PEPPER IS READING...' : 'LET PEPPER CUT IT'}
            onPress={handleCheckin}
            variant="primary"
            loading={loading}
            disabled={!rawDump.trim() || loading}
            style={styles.button}
          />
        </Card>

        {/* PEPPER Response */}
        {response && response.ai_response && (
          <View style={styles.responseContainer}>
            {/* Quick Read */}
            <Card variant="pepper">
              <Text style={styles.sectionLabel}>QUICK READ</Text>
              <Text style={styles.quickRead}>{response.ai_response.quick_read}</Text>
            </Card>

            {/* Today's Salt Check */}
            {response.ai_response.salt_check && response.ai_response.salt_check.length > 0 && (
              <Card variant="default">
                <Text style={styles.sectionLabel}>TODAY'S SALT CHECK</Text>
                <Text style={styles.subtitle}>Top 3. Not top 47.</Text>
                {response.ai_response.salt_check.map((item: string, index: number) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </Card>
            )}

            {/* Parked Items */}
            {response.ai_response.parked && response.ai_response.parked.length > 0 && (
              <Card variant="parked">
                <Text style={styles.sectionLabel}>PARKED</Text>
                <Text style={styles.subtitle}>It'll still be there when you're ready.</Text>
                {response.ai_response.parked.map((item: string, index: number) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={styles.parkedBullet}>P</Text>
                    <Text style={styles.parkedText}>{item}</Text>
                  </View>
                ))}
              </Card>
            )}

            {/* Money Check */}
            {response.ai_response.money_check && (
              <Card variant="money">
                <Text style={styles.sectionLabel}>MONEY CHECK</Text>
                <Text style={styles.checkText}>{response.ai_response.money_check}</Text>
              </Card>
            )}

            {/* Body Check */}
            {response.ai_response.body_check && (
              <Card variant="body">
                <Text style={styles.sectionLabel}>BODY CHECK</Text>
                <Text style={styles.checkText}>{response.ai_response.body_check}</Text>
              </Card>
            )}

            {/* Next Sane Step */}
            <Card style={styles.nextStepCard}>
              <Text style={styles.nextStepLabel}>NEXT SANE STEP</Text>
              <Text style={styles.nextStep}>{response.ai_response.next_sane_step}</Text>
            </Card>

            {/* Closer */}
            {response.ai_response.closer && (
              <View style={styles.closer}>
                <Text style={styles.closerText}>{response.ai_response.closer}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Layout.screenPadding,
    paddingBottom: 100,
  },
  trustSignal: {
    backgroundColor: Colors.charcoal,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  trustText: {
    color: Colors.steelBlueGrey,
    fontSize: Typography.fontSize.sm,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    color: Colors.pepperRed,
    marginBottom: Spacing.sm,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: Colors.inkBlack,
    minHeight: 150,
    marginBottom: Spacing.md,
  },
  button: {
    marginTop: Spacing.sm,
  },
  responseContainer: {
    marginTop: Spacing.lg,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.pepperRed,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
    marginBottom: Spacing.md,
  },
  quickRead: {
    fontSize: Typography.fontSize.lg,
    color: Colors.text,
    fontWeight: '600',
    lineHeight: Typography.fontSize.lg * 1.5,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  bullet: {
    color: Colors.pickleLime,
    fontSize: Typography.fontSize.xl,
    marginRight: Spacing.sm,
    lineHeight: Typography.fontSize.base * 1.5,
  },
  listText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.fontSize.base,
    lineHeight: Typography.fontSize.base * 1.5,
  },
  parkedBullet: {
    color: Colors.steelBlueGrey,
    fontSize: Typography.fontSize.sm,
    fontWeight: '600',
    marginRight: Spacing.sm,
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: Colors.steelBlueGrey,
    borderRadius: 10,
    textAlign: 'center',
    lineHeight: 18,
  },
  parkedText: {
    flex: 1,
    color: Colors.steelBlueGrey,
    fontSize: Typography.fontSize.base,
    lineHeight: Typography.fontSize.base * 1.5,
  },
  checkText: {
    color: Colors.text,
    fontSize: Typography.fontSize.base,
    lineHeight: Typography.fontSize.base * 1.5,
  },
  nextStepCard: {
    backgroundColor: Colors.pepperRed,
    borderWidth: 2,
    borderColor: Colors.brightRed,
  },
  nextStepLabel: {
    fontSize: Typography.fontSize.md,
    color: Colors.saltBone,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  nextStep: {
    fontSize: Typography.fontSize.lg,
    color: Colors.saltBone,
    fontWeight: '600',
    lineHeight: Typography.fontSize.lg * 1.5,
  },
  closer: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  closerText: {
    color: Colors.text,
    fontSize: Typography.fontSize.base,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
