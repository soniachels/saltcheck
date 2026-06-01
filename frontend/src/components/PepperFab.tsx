import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../theme';
import { Button } from './Button';
import { PepperBubble } from './PepperBubble';
import { CategoryCard } from './CategoryCard';
import apiClient from '../services/api';
import { useAppStore } from '../store/appStore';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';

function fmtTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Floating PEPPER chat FAB — visible on every tab screen.
 * Tap to open a bottom sheet dump-in-and-get-advice flow.
 */
export const PepperFab: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [rawDump, setRawDump] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const { currentUserId, pepperSpiceLevel, nickname } = useAppStore();
  const voice = useVoiceRecorder();

  const handleDump = async () => {
    if (!rawDump.trim()) return;
    setLoading(true);
    setResponse(null);
    try {
      const r = await apiClient.post('/pepper/checkin', {
        raw_dump: rawDump,
        spice_level: pepperSpiceLevel,
        nickname: nickname || undefined,
      }, { params: { user_id: currentUserId } });
      setResponse(r.data);
      setRawDump('');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (voice.isRecording) {
      const text = await voice.stopAndTranscribe();
      if (text) setRawDump((p) => (p ? `${p}\n\n${text}` : text));
    } else {
      await voice.start();
    }
  };

  const close = () => {
    setOpen(false);
    setResponse(null);
    setRawDump('');
  };

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        testID="pepper-fab"
      >
        <View style={styles.fabPulse} />
        <Ionicons name="flame" size={26} color={Colors.saltBone} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View>
                <Text style={styles.title}>PEPPER</Text>
                <Text style={styles.sub}>dump it. i'll sort it.</Text>
              </View>
              <TouchableOpacity onPress={close} style={styles.closeBtn}>
                <Ionicons name="close" size={26} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {!response && (
                <>
                  <TextInput
                    style={styles.input}
                    value={rawDump}
                    onChangeText={setRawDump}
                    placeholder="Tasks, money, body, people, bullshit..."
                    placeholderTextColor={Colors.textSubtle}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    editable={!voice.isRecording && !voice.isTranscribing}
                    testID="pepper-fab-input"
                  />

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[
                        styles.micBtn,
                        voice.isRecording && styles.micActive,
                        voice.isTranscribing && styles.micTranscribing,
                      ]}
                      onPress={handleVoiceToggle}
                      disabled={loading || voice.isTranscribing}
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
                        <Text style={styles.recordingText}>REC {fmtTime(voice.durationMs)}</Text>
                      </View>
                    ) : voice.isTranscribing ? (
                      <Text style={styles.transcribingText}>LISTENING BACK...</Text>
                    ) : (
                      <Button
                        title={loading ? 'PEPPER IS READING...' : 'CUT IT'}
                        onPress={handleDump}
                        variant="primary"
                        loading={loading}
                        disabled={!rawDump.trim() || loading}
                        style={{ flex: 1 }}
                      />
                    )}
                  </View>
                </>
              )}

              {response?.ai_response && (
                <>
                  <PepperBubble label="* PEPPER" variant="red">
                    {response.ai_response.quick_read}
                  </PepperBubble>

                  {response.ai_response.salt_check?.length > 0 && (
                    <>
                      <Text style={styles.sectionLabel}>TODAY'S SALT CHECK</Text>
                      {response.ai_response.salt_check.map((item: string, i: number) => (
                        <View key={i} style={styles.move}>
                          <View style={styles.moveDot} />
                          <Text style={styles.moveText}>{item}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {response.ai_response.parked?.length > 0 && (
                    <>
                      <Text style={styles.sectionLabel}>PARKED</Text>
                      {response.ai_response.parked.map((item: string, i: number) => (
                        <CategoryCard
                          key={i}
                          title={item}
                          badge="P"
                          variant="dark"
                        />
                      ))}
                    </>
                  )}

                  {response.ai_response.money_check && (
                    <CategoryCard
                      title={response.ai_response.money_check}
                      subtitle="MONEY CHECK"
                      icon="cash"
                      variant="lime"
                    />
                  )}
                  {response.ai_response.body_check && (
                    <CategoryCard
                      title={response.ai_response.body_check}
                      subtitle="BODY CHECK"
                      icon="heart"
                      variant="lilac"
                    />
                  )}

                  <Text style={styles.sectionLabel}>NEXT SANE STEP</Text>
                  <CategoryCard title={response.ai_response.next_sane_step} variant="red" />

                  {response.ai_response.closer && (
                    <PepperBubble variant="dark" small style={{ marginTop: Spacing.md }}>
                      {response.ai_response.closer}
                    </PepperBubble>
                  )}

                  <Button
                    title="NEW DUMP"
                    onPress={() => { setResponse(null); setRawDump(''); }}
                    variant="ghost"
                    style={{ marginTop: Spacing.lg }}
                  />
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.brightRed,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.brightRed,
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
    zIndex: 50,
  },
  fabPulse: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.brightRed,
    opacity: 0.4,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.charcoal,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingTop: 12,
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 24,
    maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.lg,
  },
  title: { fontSize: Typography.fontSize.xxl, fontWeight: '900', color: Colors.text, letterSpacing: 2 },
  sub: { fontSize: Typography.fontSize.sm, color: Colors.brightRed, fontStyle: 'italic', marginTop: 2 },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.charcoalRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { maxHeight: 600 },
  scrollContent: { paddingBottom: 40 },
  input: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: Colors.inkBlack,
    minHeight: 140,
    marginBottom: Spacing.md,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  micBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1, borderColor: Colors.brightRed,
    alignItems: 'center', justifyContent: 'center',
  },
  micActive: { backgroundColor: Colors.brightRed },
  micTranscribing: { backgroundColor: Colors.darkGreen, borderColor: Colors.pickleLime },
  recordingMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brightRed },
  recordingText: { color: Colors.brightRed, fontSize: Typography.fontSize.sm, fontWeight: '800', letterSpacing: 1 },
  transcribingText: { flex: 1, color: Colors.pickleLime, fontSize: Typography.fontSize.sm, fontWeight: '700', letterSpacing: 1, paddingLeft: Spacing.md },
  sectionLabel: {
    fontSize: Typography.fontSize.xs, color: Colors.brightRed,
    fontWeight: '800', letterSpacing: 2,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  move: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.charcoalRaised,
    padding: Layout.cardPadding,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xs,
  },
  moveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.pickleLime, marginRight: Spacing.sm },
  moveText: { flex: 1, fontSize: Typography.fontSize.base, color: Colors.text, fontWeight: '500' },
});
