import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../src/theme';
import { CategoryCard } from '../src/components/CategoryCard';
import { PepperBubble } from '../src/components/PepperBubble';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import apiClient from '../src/services/api';
import { useAppStore } from '../src/store/appStore';

interface BodyAdvice {
  vibe_read: string;
  care_moves: string[];
  doctor_flag?: string | null;
  permission: string;
}

type Tab = 'today' | 'cycle' | 'meds' | 'appts';

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export default function BodyNotesScreen() {
  const { currentUserId, pepperSpiceLevel } = useAppStore();
  const [tab, setTab] = useState<Tab>('today');
  const [bodyLogs, setBodyLogs] = useState<any[]>([]);
  const [advice, setAdvice] = useState<BodyAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

  // Editor modals
  const [todayEditor, setTodayEditor] = useState(false);
  const [cycleEditor, setCycleEditor] = useState(false);
  const [medEditor, setMedEditor] = useState(false);
  const [apptEditor, setApptEditor] = useState(false);

  // Forms
  const [todayForm, setTodayForm] = useState({
    sleep: '',
    appetite: '',
    symptoms: '',
    mood: '',
    water: '',
    notes: '',
  });
  const [cycleForm, setCycleForm] = useState({
    period_started_on: '',
    period_length_days: '',
    cycle_length_days: '28',
  });
  const [medForm, setMedForm] = useState('');
  const [apptForm, setApptForm] = useState({ label: '', date: '' });

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const res = await apiClient.get(`/body-logs/${currentUserId}`);
      setBodyLogs(res.data);
    } catch (e) {
      console.error('body logs load failed:', e);
    }
  };

  const latest = bodyLogs[0];

  // Cycle derived
  const cycleInfo = useMemo(() => {
    if (!latest?.period_started_on) return null;
    try {
      const start = new Date(latest.period_started_on);
      const today = new Date();
      const cycleLen = latest.cycle_length_days || 28;
      const dayOfCycle = (daysBetween(start, today) % cycleLen) + 1;
      const nextStart = new Date(start);
      while (nextStart < today) {
        nextStart.setDate(nextStart.getDate() + cycleLen);
      }
      const daysUntilNext = daysBetween(today, nextStart);
      return {
        dayOfCycle,
        cycleLen,
        nextDate: nextStart.toISOString().split('T')[0],
        daysUntilNext,
      };
    } catch {
      return null;
    }
  }, [latest]);

  const askPepper = async () => {
    if (!latest) {
      Alert.alert('Log something first', 'PEPPER needs notes to read.');
      return;
    }
    setAdvice(null);
    setAdviceLoading(true);
    try {
      const res = await apiClient.post(
        `/pepper/advise-body?user_id=${currentUserId}`,
        {
          sleep: latest.sleep,
          appetite: latest.appetite,
          symptoms: latest.symptoms,
          mood: latest.mood,
          water: latest.water,
          period_started_on: latest.period_started_on,
          period_length_days: latest.period_length_days,
          cycle_length_days: latest.cycle_length_days,
          medications: latest.medications,
          appointments: latest.appointments,
          notes: latest.notes,
          spice_level: pepperSpiceLevel,
        }
      );
      setAdvice(res.data);
    } catch (e) {
      Alert.alert('PEPPER is checking on you', 'Try again in a sec.');
    } finally {
      setAdviceLoading(false);
    }
  };

  const saveToday = async () => {
    const today = new Date().toISOString().split('T')[0];
    const base = latest && latest.date === today ? latest : null;
    const payload = {
      ...(base || {}),
      date: today,
      sleep: todayForm.sleep || base?.sleep || null,
      appetite: todayForm.appetite || base?.appetite || null,
      symptoms: todayForm.symptoms || base?.symptoms || null,
      mood: todayForm.mood || base?.mood || null,
      water: todayForm.water ? parseInt(todayForm.water) : base?.water || null,
      notes: todayForm.notes || base?.notes || null,
    };
    delete (payload as any).id;
    delete (payload as any).user_id;
    delete (payload as any).created_at;
    delete (payload as any).updated_at;

    if (base) {
      await apiClient.put(`/body-logs/${base.id}`, payload);
    } else {
      await apiClient.post(`/body-logs?user_id=${currentUserId}`, payload);
    }
    setTodayEditor(false);
    setTodayForm({ sleep: '', appetite: '', symptoms: '', mood: '', water: '', notes: '' });
    loadLogs();
  };

  const saveCycle = async () => {
    const today = new Date().toISOString().split('T')[0];
    const base = latest && latest.date === today ? latest : null;
    const payload = {
      ...(base || {}),
      date: today,
      period_started_on: cycleForm.period_started_on || base?.period_started_on || null,
      period_length_days: cycleForm.period_length_days
        ? parseInt(cycleForm.period_length_days)
        : base?.period_length_days || null,
      cycle_length_days: cycleForm.cycle_length_days
        ? parseInt(cycleForm.cycle_length_days)
        : base?.cycle_length_days || 28,
    };
    delete (payload as any).id;
    delete (payload as any).user_id;
    delete (payload as any).created_at;
    delete (payload as any).updated_at;

    if (base) {
      await apiClient.put(`/body-logs/${base.id}`, payload);
    } else {
      await apiClient.post(`/body-logs?user_id=${currentUserId}`, payload);
    }
    setCycleEditor(false);
    loadLogs();
  };

  const addMedication = async () => {
    if (!medForm.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    const base = latest && latest.date === today ? latest : null;
    const meds = [...(base?.medications || []), medForm.trim()];
    const payload = { ...(base || {}), date: today, medications: meds };
    delete (payload as any).id;
    delete (payload as any).user_id;
    delete (payload as any).created_at;
    delete (payload as any).updated_at;
    if (base) await apiClient.put(`/body-logs/${base.id}`, payload);
    else await apiClient.post(`/body-logs?user_id=${currentUserId}`, payload);
    setMedForm('');
    setMedEditor(false);
    loadLogs();
  };

  const removeMedication = async (idx: number) => {
    if (!latest) return;
    const meds = (latest.medications || []).filter((_: any, i: number) => i !== idx);
    const payload = { ...latest, medications: meds };
    delete (payload as any).id;
    delete (payload as any).user_id;
    delete (payload as any).created_at;
    delete (payload as any).updated_at;
    await apiClient.put(`/body-logs/${latest.id}`, payload);
    loadLogs();
  };

  const addAppointment = async () => {
    if (!apptForm.label.trim() || !apptForm.date.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    const base = latest && latest.date === today ? latest : null;
    const appts = [...(base?.appointments || []), { label: apptForm.label, date: apptForm.date }];
    const payload = { ...(base || {}), date: today, appointments: appts };
    delete (payload as any).id;
    delete (payload as any).user_id;
    delete (payload as any).created_at;
    delete (payload as any).updated_at;
    if (base) await apiClient.put(`/body-logs/${base.id}`, payload);
    else await apiClient.post(`/body-logs?user_id=${currentUserId}`, payload);
    setApptForm({ label: '', date: '' });
    setApptEditor(false);
    loadLogs();
  };

  const removeAppointment = async (idx: number) => {
    if (!latest) return;
    const appts = (latest.appointments || []).filter((_: any, i: number) => i !== idx);
    const payload = { ...latest, appointments: appts };
    delete (payload as any).id;
    delete (payload as any).user_id;
    delete (payload as any).created_at;
    delete (payload as any).updated_at;
    await apiClient.put(`/body-logs/${latest.id}`, payload);
    loadLogs();
  };

  const renderTodayTab = () => (
    <>
      <CategoryCard
        title="HOW'S THE BODY TODAY?"
        subtitle="Tap to log sleep, mood, symptoms, water"
        icon="pulse"
        variant="lilac"
        onPress={() => setTodayEditor(true)}
        large
      />

      {latest && (
        <>
          {latest.mood && (
            <CategoryCard title={latest.mood} subtitle="mood" icon="heart" variant="dark" />
          )}
          <View style={styles.statRow}>
            {latest.sleep && (
              <View style={styles.statTile}>
                <Ionicons name="moon" size={20} color={Colors.softSpiceLilac} />
                <Text style={styles.statLabel}>SLEEP</Text>
                <Text style={styles.statValue}>{latest.sleep}</Text>
              </View>
            )}
            {latest.water != null && (
              <View style={styles.statTile}>
                <Ionicons name="water" size={20} color={Colors.softSpiceLilac} />
                <Text style={styles.statLabel}>WATER</Text>
                <Text style={styles.statValue}>{latest.water} glass</Text>
              </View>
            )}
          </View>
          {latest.symptoms && (
            <CategoryCard
              title="SYMPTOMS"
              subtitle={latest.symptoms}
              icon="medkit"
              variant="dark"
            />
          )}
          {latest.appetite && (
            <CategoryCard title="APPETITE" subtitle={latest.appetite} icon="restaurant" variant="dark" />
          )}
        </>
      )}

      {/* Ask PEPPER */}
      <View style={{ marginTop: Spacing.sm }}>
        {adviceLoading ? (
          <View style={styles.loadingBubble}>
            <ActivityIndicator color={Colors.softSpiceLilac} />
            <Text style={styles.loadingText}>PEPPER IS CHECKING ON YOU...</Text>
          </View>
        ) : advice ? (
          <>
            <PepperBubble label="* PEPPER" variant="lilac">
              {advice.vibe_read}
            </PepperBubble>

            <Text style={styles.sectionLabel}>CARE MOVES</Text>
            {advice.care_moves.map((m, i) => (
              <View key={i} style={styles.moveItem}>
                <View style={styles.moveDot} />
                <Text style={styles.moveText}>{m}</Text>
              </View>
            ))}

            {advice.doctor_flag && (
              <CategoryCard
                title="WORTH A DOCTOR VISIT"
                subtitle={advice.doctor_flag}
                icon="medical"
                variant="red"
                style={{ marginTop: Spacing.md }}
              />
            )}

            <PepperBubble variant="dark" small style={{ marginTop: Spacing.md }}>
              {advice.permission}
            </PepperBubble>

            <Button
              title="ASK AGAIN"
              onPress={askPepper}
              variant="ghost"
              style={{ marginTop: Spacing.sm }}
            />
          </>
        ) : (
          <CategoryCard
            title="ASK PEPPER"
            subtitle="Read the body. Get care moves."
            icon="flame"
            variant="red"
            onPress={askPepper}
            testID="body-ask-pepper-btn"
          />
        )}
      </View>
    </>
  );

  const renderCycleTab = () => (
    <>
      {cycleInfo ? (
        <CategoryCard
          title={`DAY ${cycleInfo.dayOfCycle}`}
          subtitle={`of a ${cycleInfo.cycleLen}-day cycle`}
          icon="ellipse"
          variant="lilac"
          large
        >
          <Text style={styles.cycleNote}>
            Next period in {cycleInfo.daysUntilNext} {cycleInfo.daysUntilNext === 1 ? 'day' : 'days'} ({cycleInfo.nextDate})
          </Text>
        </CategoryCard>
      ) : (
        <CategoryCard
          title="TRACK YOUR CYCLE"
          subtitle="When did your last period start?"
          icon="calendar"
          variant="lilac"
          onPress={() => setCycleEditor(true)}
          large
        />
      )}

      <CategoryCard
        title={cycleInfo ? 'UPDATE CYCLE' : 'LOG PERIOD START'}
        subtitle="Tap to update"
        icon="create"
        variant="dark"
        onPress={() => setCycleEditor(true)}
      />

      {latest?.period_started_on && (
        <View style={{ marginTop: Spacing.md }}>
          <Text style={styles.sectionLabel}>LAST CYCLE</Text>
          <View style={styles.statRow}>
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>STARTED</Text>
              <Text style={styles.statValue}>{latest.period_started_on}</Text>
            </View>
            {latest.period_length_days && (
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>LENGTH</Text>
                <Text style={styles.statValue}>{latest.period_length_days}d</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </>
  );

  const renderMedsTab = () => {
    const meds = latest?.medications || [];
    return (
      <>
        <CategoryCard
          title="ADD MEDICATION"
          subtitle="Pills, jabs (Ozempic, etc.), vitamins"
          icon="add-circle"
          variant="lime"
          onPress={() => setMedEditor(true)}
          large
        />

        {meds.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nothing logged yet.</Text>
            <Text style={styles.emptySub}>Track what you're on so PEPPER can spot patterns.</Text>
          </View>
        ) : (
          meds.map((med: string, i: number) => (
            <CategoryCard
              key={i}
              title={med}
              icon="medical"
              variant="dark"
              rightSlot={
                <TouchableOpacity onPress={() => removeMedication(i)}>
                  <Ionicons name="close-circle" size={22} color={Colors.steelBlueGrey} />
                </TouchableOpacity>
              }
            />
          ))
        )}
      </>
    );
  };

  const renderApptsTab = () => {
    const appts: any[] = latest?.appointments || [];
    const today = new Date();
    const sorted = [...appts].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return (
      <>
        <CategoryCard
          title="ADD APPOINTMENT"
          subtitle="GP, gyno, dentist, therapy..."
          icon="calendar"
          variant="lilac"
          onPress={() => setApptEditor(true)}
          large
        />

        {sorted.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No appointments scheduled.</Text>
            <Text style={styles.emptySub}>Keep your future self informed.</Text>
          </View>
        ) : (
          sorted.map((a, i) => {
            const daysAway = a.date ? daysBetween(today, new Date(a.date)) : null;
            const overdue = daysAway != null && daysAway < 0;
            return (
              <CategoryCard
                key={i}
                title={a.label}
                subtitle={`${a.date}${
                  daysAway != null
                    ? overdue
                      ? ` · ${Math.abs(daysAway)} days ago`
                      : daysAway === 0
                      ? ' · today'
                      : ` · in ${daysAway} days`
                    : ''
                }`}
                icon="time"
                variant={overdue ? 'red' : 'dark'}
                rightSlot={
                  <TouchableOpacity onPress={() => removeAppointment(appts.indexOf(a))}>
                    <Ionicons name="close-circle" size={22} color={Colors.steelBlueGrey} />
                  </TouchableOpacity>
                }
              />
            );
          })
        )}
      </>
    );
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'today', label: 'TODAY' },
    { key: 'cycle', label: 'CYCLE' },
    { key: 'meds', label: 'MEDS' },
    { key: 'appts', label: 'APPTS' },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'BODY',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
        }}
      />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hero}>BODY</Text>
          <Text style={styles.heroSub}>your body is not a side quest.</Text>

          {/* Tab pills */}
          <View style={styles.tabRow}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tabPill, tab === t.key && styles.tabPillActive]}
                onPress={() => {
                  setTab(t.key);
                  setAdvice(null);
                }}
                testID={`body-tab-${t.key}`}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'today' && renderTodayTab()}
          {tab === 'cycle' && renderCycleTab()}
          {tab === 'meds' && renderMedsTab()}
          {tab === 'appts' && renderApptsTab()}
        </ScrollView>

        {/* Today Editor */}
        <Modal visible={todayEditor} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={styles.editorScroll}>
              <View style={styles.editorContent}>
                <Text style={styles.editorTitle}>HOW'S TODAY?</Text>
                <Input
                  label="MOOD"
                  value={todayForm.mood}
                  onChangeText={(t) => setTodayForm({ ...todayForm, mood: t })}
                  placeholder="one word ok"
                />
                <Input
                  label="SLEEP"
                  value={todayForm.sleep}
                  onChangeText={(t) => setTodayForm({ ...todayForm, sleep: t })}
                  placeholder="e.g. 6h, broken"
                />
                <Input
                  label="WATER (GLASSES)"
                  value={todayForm.water}
                  onChangeText={(t) => setTodayForm({ ...todayForm, water: t })}
                  keyboardType="number-pad"
                  placeholder="0"
                />
                <Input
                  label="SYMPTOMS"
                  value={todayForm.symptoms}
                  onChangeText={(t) => setTodayForm({ ...todayForm, symptoms: t })}
                  placeholder="anything weird"
                  multiline
                />
                <Input
                  label="APPETITE"
                  value={todayForm.appetite}
                  onChangeText={(t) => setTodayForm({ ...todayForm, appetite: t })}
                  placeholder="off, ravenous, normal..."
                />
                <Input
                  label="OTHER NOTES"
                  value={todayForm.notes}
                  onChangeText={(t) => setTodayForm({ ...todayForm, notes: t })}
                  placeholder="anything else"
                  multiline
                />
                <View style={styles.editorActions}>
                  <Button title="CANCEL" onPress={() => setTodayEditor(false)} variant="ghost" />
                  <Button title="SAVE" onPress={saveToday} variant="primary" />
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* Cycle Editor */}
        <Modal visible={cycleEditor} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.editorScroll}>
              <View style={styles.editorContent}>
                <Text style={styles.editorTitle}>CYCLE</Text>
                <Input
                  label="LAST PERIOD STARTED (YYYY-MM-DD)"
                  value={cycleForm.period_started_on}
                  onChangeText={(t) => setCycleForm({ ...cycleForm, period_started_on: t })}
                  placeholder="2026-05-15"
                />
                <Input
                  label="PERIOD LENGTH (DAYS)"
                  value={cycleForm.period_length_days}
                  onChangeText={(t) => setCycleForm({ ...cycleForm, period_length_days: t })}
                  keyboardType="number-pad"
                  placeholder="5"
                />
                <Input
                  label="CYCLE LENGTH (DAYS)"
                  value={cycleForm.cycle_length_days}
                  onChangeText={(t) => setCycleForm({ ...cycleForm, cycle_length_days: t })}
                  keyboardType="number-pad"
                  placeholder="28"
                />
                <View style={styles.editorActions}>
                  <Button title="CANCEL" onPress={() => setCycleEditor(false)} variant="ghost" />
                  <Button title="SAVE" onPress={saveCycle} variant="primary" />
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Med Editor */}
        <Modal visible={medEditor} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.editorScroll}>
              <View style={styles.editorContent}>
                <Text style={styles.editorTitle}>NEW MEDICATION</Text>
                <Input
                  label="WHAT & DOSE"
                  value={medForm}
                  onChangeText={setMedForm}
                  placeholder="e.g. Ozempic 0.5mg weekly"
                />
                <View style={styles.editorActions}>
                  <Button title="CANCEL" onPress={() => setMedEditor(false)} variant="ghost" />
                  <Button title="ADD" onPress={addMedication} variant="primary" />
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Appointment Editor */}
        <Modal visible={apptEditor} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.editorScroll}>
              <View style={styles.editorContent}>
                <Text style={styles.editorTitle}>NEW APPOINTMENT</Text>
                <Input
                  label="LABEL"
                  value={apptForm.label}
                  onChangeText={(t) => setApptForm({ ...apptForm, label: t })}
                  placeholder="GP follow-up, gyno, etc."
                />
                <Input
                  label="DATE (YYYY-MM-DD)"
                  value={apptForm.date}
                  onChangeText={(t) => setApptForm({ ...apptForm, date: t })}
                  placeholder="2026-06-15"
                />
                <View style={styles.editorActions}>
                  <Button title="CANCEL" onPress={() => setApptEditor(false)} variant="ghost" />
                  <Button title="ADD" onPress={addAppointment} variant="primary" />
                </View>
              </View>
            </View>
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
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.charcoalRaised,
    padding: 4,
    borderRadius: BorderRadius.full,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: Colors.softSpiceLilac,
  },
  tabText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSubtle,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  tabTextActive: {
    color: Colors.inkBlack,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statTile: {
    flex: 1,
    backgroundColor: Colors.charcoalRaised,
    padding: Layout.cardPadding,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSubtle,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 4,
    marginBottom: 2,
  },
  statValue: {
    fontSize: Typography.fontSize.lg,
    color: Colors.text,
    fontWeight: '700',
  },
  cycleNote: {
    fontSize: Typography.fontSize.sm,
    color: 'rgba(13,13,13,0.7)',
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.softSpiceLilac,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  moveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.charcoalRaised,
    padding: Layout.cardPadding,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xs,
  },
  moveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.softSpiceLilac,
    marginRight: Spacing.sm,
  },
  moveText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: '500',
  },
  loadingBubble: {
    padding: Spacing.xl,
    alignItems: 'center',
    backgroundColor: Colors.charcoalRaised,
    borderRadius: BorderRadius.xl,
  },
  loadingText: {
    color: Colors.softSpiceLilac,
    fontSize: Typography.fontSize.sm,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: Spacing.sm,
  },
  empty: { paddingVertical: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: Typography.fontSize.lg, color: Colors.text, fontWeight: '700' },
  emptySub: { fontSize: Typography.fontSize.sm, color: Colors.textSubtle, marginTop: Spacing.xs, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  editorScroll: { padding: Layout.screenPadding, paddingTop: 80 },
  editorContent: { backgroundColor: Colors.charcoal, borderRadius: BorderRadius.xl, padding: Layout.cardPaddingLarge },
  editorTitle: { fontSize: Typography.fontSize.xl, fontWeight: '900', color: Colors.text, letterSpacing: 1, marginBottom: Spacing.lg },
  editorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
});
