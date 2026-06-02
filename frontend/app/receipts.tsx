import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  Typography,
  Layout,
  Spacing,
  BorderRadius,
} from '../src/theme';
import { CategoryCard } from '../src/components/CategoryCard';
import { PepperBubble } from '../src/components/PepperBubble';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { ChipPicker } from '../src/components/ChipPicker';
import apiClient from '../src/services/api';
import { useAppStore } from '../src/store/appStore';

type Verdict = 'trust' | 'caution' | 'cut';
type Category = 'family' | 'romantic' | 'friendship' | 'professional' | 'blurry';

interface PersonAdvice {
  vibe_read: string;
  the_move: string;
  watch_out_for: string[];
  what_to_say?: string | null;
  verdict: Verdict;
}

interface ScreenshotRead {
  tldr: string;
  the_red_flags: string[];
  the_green_flags: string[];
  what_they_actually_want: string;
  the_move: string;
  suggested_reply?: string | null;
  verdict: Verdict;
}

const VERDICT_MAP: Record<Verdict, { color: string; label: string }> = {
  trust: { color: Colors.verdictTrust, label: 'TRUST' },
  caution: { color: Colors.verdictCaution, label: 'CAUTION' },
  cut: { color: Colors.verdictCut, label: 'CUT' },
};

const CATEGORY_META: Record<Category, {
  label: string;
  icon: any;
  variant: 'red' | 'lime' | 'lilac' | 'dark';
  hint: string;
}> = {
  family: { label: 'FAMILY', icon: 'home', variant: 'lilac', hint: 'loyalty + boundaries' },
  romantic: { label: 'ROMANTIC', icon: 'heart', variant: 'red', hint: 'eyes wide open' },
  friendship: { label: 'FRIENDSHIP', icon: 'people', variant: 'lime', hint: 'check the balance' },
  professional: { label: 'PROFESSIONAL', icon: 'briefcase', variant: 'dark', hint: 'paper trails only' },
  blurry: { label: 'BLURRY', icon: 'help-circle', variant: 'red', hint: 'pick a lane' },
};

const CATEGORY_OPTIONS = ['family', 'romantic', 'friendship', 'professional', 'blurry'] as const;

export default function ReceiptsScreen() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<any>(null);
  const [advice, setAdvice] = useState<PersonAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [screenshotRead, setScreenshotRead] = useState<ScreenshotRead | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [formData, setFormData] = useState({
    person_name: '',
    relationship_category: '' as Category | '',
    relationship_context: '',
    promised: '',
    asked_for: '',
    do_not_reveal: '',
    follow_up_needed: '',
    risk_trust_notes: '',
  });
  const { currentUserId, pepperSpiceLevel, receiptsUnlocked, setReceiptsUnlocked } = useAppStore();

  useEffect(() => {
    if (receiptsUnlocked) {
      setIsUnlocked(true);
      loadReceipts();
    }
  }, [receiptsUnlocked]);

  const authenticate = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const isEnrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Receipts',
          fallbackLabel: 'Use passcode',
        });
        if (result.success) {
          setIsUnlocked(true);
          setReceiptsUnlocked(true);
          loadReceipts();
        }
      } else {
        // Web / no biometrics — open for MVP
        setIsUnlocked(true);
        setReceiptsUnlocked(true);
        loadReceipts();
      }
    } catch (e) {
      // Last-resort fallback — let user in so they don't get stuck
      setIsUnlocked(true);
      setReceiptsUnlocked(true);
      loadReceipts();
    }
  };

  const loadReceipts = async () => {
    try {
      const response = await apiClient.get(`/person-notes/${currentUserId}`);
      setReceipts(response.data);
    } catch (e) {
      console.error('Failed to load receipts:', e);
    }
  };

  const askPepper = async (receipt: any) => {
    setActiveReceipt(receipt);
    setAdvice(null);
    setScreenshotRead(null);
    setAdviceLoading(true);
    try {
      const res = await apiClient.post(
        `/pepper/advise-person?user_id=${currentUserId}`,
        {
          person_note_id: receipt.id,
          person_name: receipt.person_name,
          relationship_category: receipt.relationship_category,
          relationship_context: receipt.relationship_context,
          promised: receipt.promised,
          asked_for: receipt.asked_for,
          do_not_reveal: receipt.do_not_reveal,
          follow_up_needed: receipt.follow_up_needed,
          risk_trust_notes: receipt.risk_trust_notes,
          spice_level: pepperSpiceLevel,
        }
      );
      setAdvice(res.data);
    } catch (e) {
      Alert.alert('PEPPER is reading the room', 'Try again in a sec.');
    } finally {
      setAdviceLoading(false);
    }
  };

  const dropScreenshot = async () => {
    if (!activeReceipt) return;
    try {
      // Request permission
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          Alert.alert(
            'Photo access needed',
            'PEPPER needs to see the screenshot to read it. Open settings to enable.',
            [{ text: 'Cancel', style: 'cancel' }, { text: 'OPEN SETTINGS', onPress: () => {
              // @ts-ignore
              if (typeof require !== 'undefined') {
                try { require('react-native').Linking.openSettings(); } catch {}
              }
            }}]
          );
          return;
        }
        Alert.alert('Photo access', 'PEPPER needs to see the screenshot to read it.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: false,
      });
      if (result.canceled || !result.assets || !result.assets[0]) return;

      const asset = result.assets[0];
      setScreenshotLoading(true);
      setScreenshotRead(null);

      // Build form data
      const form = new FormData();
      // React Native FormData file format
      const filename = asset.fileName || `screenshot.${(asset.uri.split('.').pop() || 'jpg').toLowerCase()}`;
      const type = asset.mimeType || 'image/jpeg';
      // @ts-ignore — RN FormData accepts {uri, name, type}
      form.append('file', { uri: asset.uri, name: filename, type });
      form.append('user_id', currentUserId);
      form.append('person_name', activeReceipt.person_name || '');
      form.append('relationship_category', activeReceipt.relationship_category || '');
      form.append('spice_level', pepperSpiceLevel);

      const res = await apiClient.post('/pepper/analyze-receipt', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      setScreenshotRead(res.data);
    } catch (e: any) {
      console.error('screenshot analyze err', e);
      Alert.alert("PEPPER couldn't read that", 'Try another shot or one with clearer text.');
    } finally {
      setScreenshotLoading(false);
    }
  };

  const openEditor = (receipt?: any) => {
    if (receipt) {
      setFormData({
        person_name: receipt.person_name,
        relationship_category: (receipt.relationship_category as Category) || '',
        relationship_context: receipt.relationship_context || '',
        promised: receipt.promised || '',
        asked_for: receipt.asked_for || '',
        do_not_reveal: receipt.do_not_reveal || '',
        follow_up_needed: receipt.follow_up_needed || '',
        risk_trust_notes: receipt.risk_trust_notes || '',
      });
      setActiveReceipt(receipt);
    } else {
      setFormData({
        person_name: '',
        relationship_category: '',
        relationship_context: '',
        promised: '',
        asked_for: '',
        do_not_reveal: '',
        follow_up_needed: '',
        risk_trust_notes: '',
      });
      setActiveReceipt(null);
    }
    setAdvice(null);
    setScreenshotRead(null);
    setEditorVisible(true);
  };

  const saveReceipt = async () => {
    if (!formData.person_name.trim()) {
      Alert.alert('Hold up', 'Give them a name first.');
      return;
    }
    try {
      const payload: any = { ...formData, locked: true };
      if (!payload.relationship_category) delete payload.relationship_category;
      if (activeReceipt) {
        await apiClient.put(`/person-notes/${activeReceipt.id}`, payload);
      } else {
        await apiClient.post(`/person-notes?user_id=${currentUserId}`, payload);
      }
      // Fully close both editor + advice — user can tap card again to re-ask PEPPER.
      setEditorVisible(false);
      setActiveReceipt(null);
      setAdvice(null);
      setScreenshotRead(null);
      loadReceipts();
    } catch (e) {
      Alert.alert('Hiccup', 'Could not save. Try again.');
    }
  };

  const closeEditor = () => {
    setEditorVisible(false);
    // If this was a "new" receipt (no activeReceipt to view), clear everything
    // If editing an existing one, clear activeReceipt to prevent advice modal popping back
    setActiveReceipt(null);
    setAdvice(null);
  };

  const deleteReceipt = (id: string) => {
    Alert.alert('Delete this receipt?', 'Permanent. No undo.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await apiClient.delete(`/person-notes/${id}`);
          setEditorVisible(false);
          setActiveReceipt(null);
          loadReceipts();
        },
      },
    ]);
  };

  if (!isUnlocked) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'RECEIPTS',
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.text,
          }}
        />
        <View style={styles.lockedContainer}>
          <View style={styles.lockedContent}>
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={48} color={Colors.brightRed} />
            </View>
            <Text style={styles.lockedTitle}>RECEIPTS</Text>
            <Text style={styles.lockedSubtitle}>trust no one.</Text>
            <Text style={styles.lockedText}>
              Saved. Between us. PEPPER reads the room when you ask.
            </Text>
            <Button title="UNLOCK" onPress={authenticate} variant="primary" style={styles.unlockButton} />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'RECEIPTS',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
        }}
      />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hero}>RECEIPTS</Text>
          <Text style={styles.heroSub}>trust no one. remember everything.</Text>

          {/* Category filter chips */}
          {receipts.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              style={{ marginVertical: Spacing.md }}
            >
              <TouchableOpacity
                style={[styles.filterChip, activeCategory === 'all' && styles.filterChipActive]}
                onPress={() => setActiveCategory('all')}
              >
                <Text style={[styles.filterText, activeCategory === 'all' && styles.filterTextActive]}>
                  ALL · {receipts.length}
                </Text>
              </TouchableOpacity>
              {CATEGORY_OPTIONS.map((cat) => {
                const count = receipts.filter((r) => r.relationship_category === cat).length;
                if (count === 0) return null;
                const meta = CATEGORY_META[cat];
                const active = activeCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setActiveCategory(cat)}
                  >
                    <Ionicons name={meta.icon} size={14} color={active ? Colors.inkBlack : Colors.text} />
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {meta.label} · {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {receipts.filter((r) => !r.relationship_category).length > 0 && (
                <TouchableOpacity
                  style={[styles.filterChip, activeCategory === ('uncategorized' as any) && styles.filterChipActive]}
                  onPress={() => setActiveCategory('uncategorized' as any)}
                >
                  <Text style={[styles.filterText, activeCategory === ('uncategorized' as any) && styles.filterTextActive]}>
                    UNCATEGORIZED · {receipts.filter((r) => !r.relationship_category).length}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {receipts.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No receipts yet.</Text>
              <Text style={styles.emptySub}>Add someone PEPPER should keep an eye on.</Text>
            </View>
          ) : (
            receipts
              .filter((r) => {
                if (activeCategory === 'all') return true;
                if (activeCategory === ('uncategorized' as any)) return !r.relationship_category;
                return r.relationship_category === activeCategory;
              })
              .map((receipt) => {
                const cat = receipt.relationship_category as Category | undefined;
                const meta = cat ? CATEGORY_META[cat] : undefined;
                return (
                  <CategoryCard
                    key={receipt.id}
                    title={receipt.person_name}
                    subtitle={
                      meta
                        ? `${meta.label} · ${receipt.relationship_context || meta.hint}`
                        : receipt.relationship_context || 'no context'
                    }
                    icon={meta?.icon}
                    variant={meta?.variant || 'dark'}
                    onPress={() => askPepper(receipt)}
                    rightSlot={
                      <Ionicons name="chevron-forward" size={20} color={Colors.steelBlueGrey} />
                    }
                  >
                    {receipt.risk_trust_notes && (
                      <Text style={styles.cardNote} numberOfLines={2}>
                        "{receipt.risk_trust_notes}"
                      </Text>
                    )}
                  </CategoryCard>
                );
              })
          )}
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => openEditor()}
          testID="receipts-add-fab"
        >
          <Ionicons name="add" size={28} color={Colors.saltBone} />
        </TouchableOpacity>

        {/* Advice Modal — Ask PEPPER about this person */}
        <Modal
          visible={!!activeReceipt && !editorVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setActiveReceipt(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetTitle}>{activeReceipt?.person_name}</Text>
                    {activeReceipt?.relationship_context && (
                      <Text style={styles.sheetSub}>{activeReceipt.relationship_context}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => openEditor(activeReceipt)}>
                    <Ionicons name="create" size={22} color={Colors.steelBlueGrey} />
                  </TouchableOpacity>
                </View>

                {adviceLoading ? (
                  <View style={styles.loadingBubble}>
                    <ActivityIndicator color={Colors.brightRed} />
                    <Text style={styles.loadingText}>PEPPER IS READING THE ROOM...</Text>
                  </View>
                ) : advice ? (
                  <>
                    {/* Verdict pill */}
                    <View
                      style={[
                        styles.verdictPill,
                        { backgroundColor: VERDICT_MAP[advice.verdict].color },
                      ]}
                    >
                      <Text style={styles.verdictText}>{VERDICT_MAP[advice.verdict].label}</Text>
                    </View>

                    <PepperBubble label="* PEPPER" variant="red">
                      {advice.vibe_read}
                    </PepperBubble>

                    <Text style={styles.sectionLabel}>THE MOVE</Text>
                    <CategoryCard title={advice.the_move} variant="lime" />

                    {advice.watch_out_for && advice.watch_out_for.length > 0 && (
                      <>
                        <Text style={styles.sectionLabel}>WATCH OUT FOR</Text>
                        {advice.watch_out_for.map((item, i) => (
                          <View key={i} style={styles.flagItem}>
                            <Ionicons name="warning" size={16} color={Colors.brightRed} />
                            <Text style={styles.flagText}>{item}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    {advice.what_to_say && (
                      <>
                        <Text style={styles.sectionLabel}>SAY THIS</Text>
                        <PepperBubble variant="lilac">{advice.what_to_say}</PepperBubble>
                      </>
                    )}
                  </>
                ) : (
                  <CategoryCard
                    title="Ask PEPPER"
                    subtitle="Read the vibe and get one clear move."
                    variant="red"
                    icon="flame"
                    onPress={() => activeReceipt && askPepper(activeReceipt)}
                  />
                )}

                {/* Screenshot analyzer */}
                <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>SCREENSHOT READ</Text>
                {screenshotLoading ? (
                  <View style={styles.loadingBubble}>
                    <ActivityIndicator color={Colors.softSpiceLilac} />
                    <Text style={styles.loadingText}>PEPPER IS DECODING THE CHAT...</Text>
                  </View>
                ) : screenshotRead ? (
                  <>
                    <View
                      style={[
                        styles.verdictPill,
                        { backgroundColor: VERDICT_MAP[screenshotRead.verdict].color },
                      ]}
                    >
                      <Text style={styles.verdictText}>{VERDICT_MAP[screenshotRead.verdict].label} · SCREENSHOT</Text>
                    </View>
                    <PepperBubble label="* PEPPER" variant="lilac">
                      {screenshotRead.tldr}
                    </PepperBubble>

                    {screenshotRead.what_they_actually_want && (
                      <>
                        <Text style={styles.sectionLabel}>WHAT THEY ACTUALLY WANT</Text>
                        <CategoryCard title={screenshotRead.what_they_actually_want} variant="dark" />
                      </>
                    )}

                    {screenshotRead.the_red_flags && screenshotRead.the_red_flags.length > 0 && (
                      <>
                        <Text style={styles.sectionLabel}>RED FLAGS</Text>
                        {screenshotRead.the_red_flags.map((item, i) => (
                          <View key={`r-${i}`} style={styles.flagItem}>
                            <Ionicons name="warning" size={16} color={Colors.brightRed} />
                            <Text style={styles.flagText}>{item}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    {screenshotRead.the_green_flags && screenshotRead.the_green_flags.length > 0 && (
                      <>
                        <Text style={styles.sectionLabel}>GREEN FLAGS</Text>
                        {screenshotRead.the_green_flags.map((item, i) => (
                          <View key={`g-${i}`} style={styles.flagItem}>
                            <Ionicons name="checkmark-circle" size={16} color={Colors.pickleLime} />
                            <Text style={styles.flagText}>{item}</Text>
                          </View>
                        ))}
                      </>
                    )}

                    <Text style={styles.sectionLabel}>THE MOVE</Text>
                    <CategoryCard title={screenshotRead.the_move} variant="lime" />

                    {screenshotRead.suggested_reply && (
                      <>
                        <Text style={styles.sectionLabel}>SUGGESTED REPLY</Text>
                        <PepperBubble variant="lilac">{screenshotRead.suggested_reply}</PepperBubble>
                      </>
                    )}

                    <Button
                      title="DROP ANOTHER SCREENSHOT"
                      onPress={dropScreenshot}
                      variant="ghost"
                      style={{ marginTop: Spacing.md }}
                    />
                  </>
                ) : (
                  <CategoryCard
                    title="Drop a screenshot"
                    subtitle="PEPPER reads the convo. Decodes the tone. Suggests a reply."
                    variant="lilac"
                    icon="image"
                    onPress={dropScreenshot}
                  />
                )}

                <Button
                  title="CLOSE"
                  onPress={() => setActiveReceipt(null)}
                  variant="ghost"
                  style={styles.closeBtn}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Editor Modal */}
        <Modal visible={editorVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={styles.editorScroll}>
              <View style={styles.editorContent}>
                <Text style={styles.editorTitle}>
                  {activeReceipt ? 'EDIT RECEIPT' : 'NEW RECEIPT'}
                </Text>

                <Input
                  label="PERSON NAME"
                  value={formData.person_name}
                  onChangeText={(t) => setFormData({ ...formData, person_name: t })}
                  placeholder="Who is this about?"
                />
                <ChipPicker
                  label="CATEGORY"
                  options={CATEGORY_OPTIONS as any}
                  value={formData.relationship_category || ''}
                  onChange={(v) => setFormData({ ...formData, relationship_category: v as Category })}
                  variant="red"
                  testIDPrefix="rel-cat"
                />
                {formData.relationship_category && (
                  <Text style={styles.categoryHint}>
                    {CATEGORY_META[formData.relationship_category as Category]?.hint}
                  </Text>
                )}
                <Input
                  label="RELATIONSHIP CONTEXT"
                  value={formData.relationship_context}
                  onChangeText={(t) => setFormData({ ...formData, relationship_context: t })}
                  placeholder="ex, client, mom, friend..."
                />
                <Input
                  label="WHAT THEY PROMISED"
                  value={formData.promised}
                  onChangeText={(t) => setFormData({ ...formData, promised: t })}
                  placeholder="What did they say they'd do?"
                  multiline
                />
                <Input
                  label="WHAT THEY'RE ASKING FOR"
                  value={formData.asked_for}
                  onChangeText={(t) => setFormData({ ...formData, asked_for: t })}
                  placeholder="What do they want?"
                  multiline
                />
                <Input
                  label="DO NOT REVEAL"
                  value={formData.do_not_reveal}
                  onChangeText={(t) => setFormData({ ...formData, do_not_reveal: t })}
                  placeholder="Don't over-explain to this one."
                  multiline
                />
                <Input
                  label="FOLLOW UP NEEDED"
                  value={formData.follow_up_needed}
                  onChangeText={(t) => setFormData({ ...formData, follow_up_needed: t })}
                  placeholder="What needs checking?"
                  multiline
                />
                <Input
                  label="RISK / TRUST NOTES"
                  value={formData.risk_trust_notes}
                  onChangeText={(t) => setFormData({ ...formData, risk_trust_notes: t })}
                  placeholder="Red flags, green flags, vibes"
                  multiline
                />

                <View style={styles.editorActions}>
                  <Button title="CANCEL" onPress={closeEditor} variant="ghost" />
                  <Button title="SAVE" onPress={saveReceipt} variant="primary" />
                </View>

                {activeReceipt && (
                  <Button
                    title="DELETE RECEIPT"
                    onPress={() => deleteReceipt(activeReceipt.id)}
                    variant="danger"
                    style={{ marginTop: Spacing.md }}
                  />
                )}
              </View>
            </ScrollView>
          </View>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Layout.screenPadding, paddingBottom: 120 },
  hero: {
    fontSize: Typography.fontSize.display,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 2,
    marginTop: Spacing.sm,
  },
  heroSub: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSubtle,
    marginBottom: Spacing.xl,
    fontStyle: 'italic',
  },
  cardNote: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSubtle,
    fontStyle: 'italic',
  },
  empty: { paddingVertical: Spacing.xxl, alignItems: 'center' },
  emptyText: { fontSize: Typography.fontSize.lg, color: Colors.text, fontWeight: '700' },
  emptySub: { fontSize: Typography.fontSize.sm, color: Colors.textSubtle, marginTop: Spacing.xs },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.brightRed,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  // Locked screen
  lockedContainer: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Layout.screenPadding },
  lockedContent: { alignItems: 'center' },
  lockBadge: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  lockedTitle: { fontSize: Typography.fontSize.hero, fontWeight: '900', color: Colors.text, letterSpacing: 3 },
  lockedSubtitle: { fontSize: Typography.fontSize.lg, color: Colors.brightRed, marginTop: Spacing.sm, fontStyle: 'italic' },
  lockedText: { fontSize: Typography.fontSize.base, color: Colors.textSubtle, marginTop: Spacing.md, marginBottom: Spacing.xl, textAlign: 'center', maxWidth: 280 },
  unlockButton: { minWidth: 220 },
  // Sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.charcoal,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Layout.screenPadding,
    paddingTop: 12,
    maxHeight: '90%',
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  sheetTitle: { fontSize: Typography.fontSize.xxl, fontWeight: '900', color: Colors.text, letterSpacing: 1 },
  sheetSub: { fontSize: Typography.fontSize.sm, color: Colors.textSubtle, marginTop: 2 },
  verdictPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  verdictText: { fontSize: Typography.fontSize.xs, fontWeight: '900', color: Colors.inkBlack, letterSpacing: 2 },
  sectionLabel: { fontSize: Typography.fontSize.xs, color: Colors.brightRed, fontWeight: '800', letterSpacing: 2, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  flagItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.charcoalRaised, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.xs },
  flagText: { fontSize: Typography.fontSize.base, color: Colors.text, marginLeft: Spacing.sm, fontWeight: '600' },
  loadingBubble: { padding: Spacing.xl, alignItems: 'center', backgroundColor: Colors.charcoalRaised, borderRadius: BorderRadius.xl, marginBottom: Spacing.lg },
  loadingText: { color: Colors.brightRed, fontSize: Typography.fontSize.sm, fontWeight: '700', letterSpacing: 2, marginTop: Spacing.sm },
  closeBtn: { marginTop: Spacing.xl, marginBottom: Spacing.lg },
  // Editor
  editorScroll: { padding: Layout.screenPadding, paddingTop: 60 },
  editorContent: { backgroundColor: Colors.charcoal, borderRadius: BorderRadius.xl, padding: Layout.cardPaddingLarge },
  editorTitle: { fontSize: Typography.fontSize.xl, fontWeight: '900', color: Colors.text, letterSpacing: 1, marginBottom: Spacing.lg },
  editorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  // Category filter chips
  filterRow: { gap: Spacing.sm, paddingRight: Spacing.md },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.pickleLime,
    borderColor: Colors.pickleLime,
  },
  filterText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text,
    fontWeight: '800',
    letterSpacing: 1,
  },
  filterTextActive: {
    color: Colors.inkBlack,
  },
  categoryHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.brightRed,
    fontStyle: 'italic',
    marginTop: -8,
    marginBottom: Spacing.md,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
