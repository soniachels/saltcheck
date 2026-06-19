import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../theme';
import { Button } from './Button';
import { PepperBubble } from './PepperBubble';
import { CategoryCard } from './CategoryCard';
import apiClient from '../services/api';
import { useAppStore } from '../store/appStore';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';

// ---- Animation tuning (tweak these) ----
const ORB_SPIN_MS = 7000;      // gradient swirl speed (higher = slower)
const CARD_IN_DAMPING = 15;    // card spring: lower = bouncier
const CARD_IN_STIFFNESS = 150; // card spring: higher = snappier
const CARD_OUT_MS = 220;       // close animation duration

function fmtTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Floating PEPPER orb — a living, glowing energy button on every tab.
 * Tap to bloom a frosted floating card with the dump-and-advise flow.
 */
export const PepperFab: React.FC = () => {
  const [mounted, setMounted] = useState(false); // keeps Modal alive during close anim
  const [rawDump, setRawDump] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const { currentUserId, pepperSpiceLevel, nickname } = useAppStore();
  const voice = useVoiceRecorder();

  // Animated values
  const spin = useRef(new Animated.Value(0)).current;       // orb gradient swirl (idle loop)
  const pressScale = useRef(new Animated.Value(1)).current;  // orb tap pulse
  const card = useRef(new Animated.Value(0)).current;        // card open/close 0→1

  // Idle loop — the orb's gradient keeps swirling even when untouched.
  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: ORB_SPIN_MS, easing: Easing.linear, useNativeDriver: true })
    );
    spinLoop.start();
    return () => { spinLoop.stop(); };
  }, [spin]);

  const openSheet = () => {
    // Orb reacts: quick pulse 1 → 1.06 → 1
    Animated.sequence([
      Animated.timing(pressScale, { toValue: 1.06, duration: 110, useNativeDriver: true }),
      Animated.timing(pressScale, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    // Card blooms up with a spring
    setMounted(true);
    card.setValue(0);
    requestAnimationFrame(() => {
      Animated.spring(card, {
        toValue: 1,
        useNativeDriver: true,
        damping: CARD_IN_DAMPING,
        stiffness: CARD_IN_STIFFNESS,
        mass: 0.9,
      }).start();
    });
  };

  const close = () => {
    Animated.timing(card, {
      toValue: 0,
      duration: CARD_OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setMounted(false);
      setResponse(null);
      setRawDump('');
    });
  };

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

  const backdropOpacity = card.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const cardOpacity = card.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const cardTranslateY = card.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const cardScale = card.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

  return (
    <>
      {/* ---- The living orb ---- */}
      <View style={styles.orbWrap} pointerEvents="box-none">
        <Animated.View style={{ transform: [{ scale: pressScale }] }}>
          <TouchableOpacity
            style={styles.orb}
            activeOpacity={0.9}
            onPress={openSheet}
            testID="pepper-fab"
            accessibilityRole="button"
            accessibilityLabel="Open PEPPER"
          >
            {/* swirling gradient */}
            <Animated.View
              style={[styles.gradientLayer, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}
            >
              <LinearGradient
                colors={[Colors.pepperRed, Colors.softSpiceLilac, Colors.inkBlack, Colors.brightRed]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            {/* counter-rotating accent layer for depth / grainy motion */}
            <Animated.View
              style={[styles.gradientLayer, { opacity: 0.55, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] }) }] }]}
            >
              <LinearGradient
                colors={['transparent', Colors.brightRed, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            {/* glass sheen (top light) */}
            <LinearGradient
              colors={['rgba(255,255,255,0.28)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 0.6 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Ionicons name="flame" size={26} color={Colors.saltBone} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ---- Frosted floating card ---- */}
      <Modal visible={mounted} transparent animationType="none" onRequestClose={close}>
        <KeyboardAvoidingView
          style={styles.overlayRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* dim + blur backdrop, tap to close */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close PEPPER">
              <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.dim} />
            </Pressable>
          </Animated.View>

          {/* the card */}
          <Animated.View
            style={[
              styles.cardWrap,
              { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }, { scale: cardScale }] },
            ]}
          >
            <BlurView intensity={45} tint="dark" style={styles.cardBlur}>
              <View style={styles.cardTint}>
                <View style={styles.header}>
                  <View>
                    <Text style={styles.title}>PEPPER</Text>
                    <Text style={styles.sub}>dump it. i'll sort it.</Text>
                  </View>
                  <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityLabel="Close PEPPER">
                    <Ionicons name="close" size={24} color={Colors.text} />
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
                            <CategoryCard key={i} title={item} badge="P" variant="dark" />
                          ))}
                        </>
                      )}

                      {response.ai_response.money_check && (
                        <CategoryCard title={response.ai_response.money_check} subtitle="MONEY CHECK" icon="cash" variant="lime" />
                      )}
                      {response.ai_response.body_check && (
                        <CategoryCard title={response.ai_response.body_check} subtitle="BODY CHECK" icon="heart" variant="lilac" />
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
            </BlurView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const ORB = 60;
const styles = StyleSheet.create({
  orbWrap: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: Colors.inkBlack,
  },
  gradientLayer: {
    position: 'absolute',
    width: ORB * 1.9,
    height: ORB * 1.9,
    top: -(ORB * 0.45),
    left: -(ORB * 0.45),
  },
  overlayRoot: { flex: 1, justifyContent: 'flex-end' },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  cardWrap: {
    marginHorizontal: 10,
    marginBottom: 22,
    borderRadius: BorderRadius.xxl,
    maxHeight: '88%',
    // soft shadow for depth (on the non-clipping wrapper)
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  cardBlur: {
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardTint: {
    backgroundColor: 'rgba(18,16,20,0.55)', // translucent dark glass over the blur
    paddingTop: Spacing.lg,
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.lg,
  },
  title: { fontSize: Typography.fontSize.xxl, fontWeight: '900', color: Colors.text, letterSpacing: 2 },
  sub: { fontSize: Typography.fontSize.sm, color: Colors.brightRed, fontStyle: 'italic', marginTop: 2 },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { maxHeight: 560 },
  scrollContent: { paddingBottom: 24 },
  input: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: Layout.cardPadding,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xs,
  },
  moveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.pickleLime, marginRight: Spacing.sm },
  moveText: { flex: 1, fontSize: Typography.fontSize.base, color: Colors.text, fontWeight: '500' },
});
