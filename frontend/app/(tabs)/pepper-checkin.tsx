import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { Button } from '../../src/components/Button';
import { CategoryCard } from '../../src/components/CategoryCard';
import { PepperBubble } from '../../src/components/PepperBubble';
import apiClient from '../../src/services/api';
import { useAppStore } from '../../src/store/appStore';
import { useVoiceRecorder } from '../../src/hooks/useVoiceRecorder';

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const SPICE_META: Record<string, { dot: string; label: string }> = {
  mild: { dot: '○', label: 'MILD' },
  medium: { dot: '◐', label: 'MEDIUM' },
  spicy: { dot: '●', label: 'SPICY' },
  extra_spicy: { dot: '●', label: 'EXTRA SPICY' },
};

export default function PepperCheckinScreen() {
  const [rawDump, setRawDump] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const { currentUserId, pepperSpiceLevel, nickname } = useAppStore();
  const router = useRouter();
  const voice = useVoiceRecorder();

  useFocusEffect(
    useCallback(() => {
      // intentionally keep response when re-focusing
    }, [])
  );

  const handleCheckin = async () => {
    if (!rawDump.trim()) return;

    setLoading(true);
    setResponse(null);
    try {
      const result = await apiClient.post(
        '/pepper/checkin',
        {
          raw_dump: rawDump,
          spice_level: pepperSpiceLevel,
          nickname: nickname || undefined,
        },
        { params: { user_id: currentUserId } }
      );

      setResponse(result.data);
      setRawDump('');
    } catch (error) {
      console.error('PEPPER is taking a break:', error);
      alert('PEPPER is taking a break. Try again?');
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (voice.isRecording) {
      const text = await voice.stopAndTranscribe();
      if (text) {
        setRawDump((prev) => (prev ? `${prev}\n\n${text}` : text));
      }
    } else {
      await voice.start();
    }
  };

  const spice = SPICE_META[pepperSpiceLevel] || SPICE_META.medium;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header row with close button */}
          <View style={styles.headerRow}>
            <View style={styles.spiceTag}>
              <Text style={styles.spiceDot}>{spice.dot}</Text>
              <Text style={styles.spiceLabel}>{spice.label}</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.closeBtn}
              testID="pepper-close-btn"
            >
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>* PEPPER CHECK-IN</Text>
            <Text style={styles.heroTitle}>dump it.</Text>
            <Text style={styles.heroSub}>tasks, money, body, people, bullshit. i'll sort it.</Text>
          </View>

          <PepperBubble label="* PEPPER" variant="red" small>
            Stay private. You choose what gets saved. Don't pretty it up.
          </PepperBubble>

          {/* Input */}
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>BRAIN DUMP</Text>
            <TextInput
              style={styles.input}
              placeholder="what's the noise today?"
              placeholderTextColor={Colors.steelBlueGrey}
              value={rawDump}
              onChangeText={setRawDump}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              testID="pepper-dump-input"
              editable={!voice.isRecording && !voice.isTranscribing}
            />

            {/* Voice + Action Row */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.micButton,
                  voice.isRecording && styles.micButtonActive,
                  voice.isTranscribing && styles.micButtonTranscribing,
                ]}
                onPress={handleVoiceToggle}
                disabled={loading || voice.isTranscribing}
                testID="pepper-voice-btn"
              >
                {voice.isTranscribing ? (
                  <ActivityIndicator color={Colors.saltBone} size="small" />
                ) : voice.isRecording ? (
                  <Ionicons name="stop" size={22} color={Colors.saltBone} />
                ) : (
                  <Ionicons name="mic" size={22} color={Colors.saltBone} />
                )}
              </TouchableOpacity>

              {voice.isRecording ? (
                <View style={styles.recordingMeta}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>
                    REC {formatDuration(voice.durationMs)}
                  </Text>
                </View>
              ) : voice.isTranscribing ? (
                <Text style={styles.transcribingText}>PEPPER IS LISTENING BACK…</Text>
              ) : (
                <Button
                  title={loading ? 'PEPPER IS READING…' : 'CUT IT'}
                  onPress={handleCheckin}
                  variant="primary"
                  loading={loading}
                  disabled={!rawDump.trim() || loading}
                  style={styles.button}
                />
              )}
            </View>
          </View>

          {/* PEPPER Response */}
          {response && response.ai_response && (
            <View style={styles.responseContainer}>
              <PepperBubble label="* PEPPER" variant="red">
                {response.ai_response.quick_read}
              </PepperBubble>

              {response.ai_response.salt_check &&
                response.ai_response.salt_check.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>TODAY'S SALT CHECK.</Text>
                    <Text style={styles.sectionHint}>top 3. not top 47.</Text>
                    {response.ai_response.salt_check
                      .slice(0, 3)
                      .map((item: string, i: number) => (
                        <CategoryCard
                          key={i}
                          title={item}
                          badge={`${i + 1}`}
                          variant={i === 0 ? 'lime' : 'dark'}
                        />
                      ))}
                  </>
                )}

              {response.ai_response.parked && response.ai_response.parked.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>PARKED.</Text>
                  <Text style={styles.sectionHint}>still there when you're ready.</Text>
                  {response.ai_response.parked.map((item: string, i: number) => (
                    <CategoryCard key={i} title={item} badge="P" variant="dark" />
                  ))}
                </>
              )}

              {response.ai_response.money_check && (
                <>
                  <Text style={styles.sectionLabel}>MONEY CHECK.</Text>
                  <PepperBubble variant="lime">
                    {response.ai_response.money_check}
                  </PepperBubble>
                </>
              )}

              {response.ai_response.body_check && (
                <>
                  <Text style={styles.sectionLabel}>BODY CHECK.</Text>
                  <PepperBubble variant="lilac">
                    {response.ai_response.body_check}
                  </PepperBubble>
                </>
              )}

              {response.ai_response.next_sane_step && (
                <>
                  <Text style={styles.sectionLabel}>NEXT SANE STEP.</Text>
                  <CategoryCard
                    title={response.ai_response.next_sane_step}
                    icon="flame"
                    variant="red"
                    large
                  />
                </>
              )}

              {response.ai_response.closer && (
                <PepperBubble variant="dark" small style={{ marginTop: Spacing.md }}>
                  {response.ai_response.closer}
                </PepperBubble>
              )}

              <Button
                title="SEE IT ON TODAY"
                onPress={() => router.push('/(tabs)')}
                variant="primary"
                style={styles.viewTodayBtn}
                testID="view-on-today-btn"
              />
              <Button
                title="DUMP AGAIN"
                onPress={() => setResponse(null)}
                variant="ghost"
                style={{ marginTop: Spacing.sm }}
              />
            </View>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: {
    padding: Layout.screenPadding,
    paddingBottom: 80,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  spiceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.charcoalRaised,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  spiceDot: {
    color: Colors.brightRed,
    fontSize: Typography.fontSize.sm,
    fontWeight: '800',
  },
  spiceLabel: {
    color: Colors.text,
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    letterSpacing: 2,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { marginBottom: Spacing.lg },
  heroLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.brightRed,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: Typography.fontSize.display,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 1,
  },
  heroSub: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSubtle,
    fontStyle: 'italic',
    marginTop: 4,
  },
  inputCard: {
    backgroundColor: Colors.charcoalRaised,
    borderRadius: BorderRadius.xl,
    padding: Layout.cardPaddingLarge,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.brightRed,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: Typography.fontSize.md,
    color: Colors.text,
    backgroundColor: Colors.inkBlack,
    minHeight: 160,
    marginBottom: Spacing.md,
    lineHeight: Typography.fontSize.md * 1.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  micButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.inkBlack,
    borderWidth: 1,
    borderColor: Colors.brightRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: Colors.brightRed,
    borderColor: Colors.brightRed,
  },
  micButtonTranscribing: {
    backgroundColor: Colors.darkGreen,
    borderColor: Colors.pickleLime,
  },
  recordingMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brightRed,
  },
  recordingText: {
    color: Colors.brightRed,
    fontSize: Typography.fontSize.sm,
    fontWeight: '800',
    letterSpacing: 1,
  },
  transcribingText: {
    flex: 1,
    color: Colors.pickleLime,
    fontSize: Typography.fontSize.sm,
    fontWeight: '800',
    letterSpacing: 1,
    paddingLeft: Spacing.md,
  },
  button: { flex: 1 },
  responseContainer: { marginTop: Spacing.sm },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.brightRed,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: Spacing.lg,
  },
  sectionHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSubtle,
    marginBottom: Spacing.sm,
    fontStyle: 'italic',
  },
  viewTodayBtn: { marginTop: Spacing.lg },
});
