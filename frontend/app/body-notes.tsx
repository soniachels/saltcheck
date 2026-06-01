import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../src/theme';
import { CategoryCard } from '../src/components/CategoryCard';
import { PepperBubble } from '../src/components/PepperBubble';
import { ChipPicker } from '../src/components/ChipPicker';
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

const MOODS = ['great', 'fine', 'meh', 'foggy', 'anxious', 'sad', 'wired', 'flat'];
const APPETITE = ['ravenous', 'normal', 'low', 'nausea'];
const SLEEP = ['great', 'ok', 'broken', 'awful', 'none'];

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export default function BodyScreen() {
  const { currentUserId, pepperSpiceLevel } = useAppStore();
  const [bodyLogs, setBodyLogs] = useState<any[]>([]);
  const [advice, setAdvice] = useState<BodyAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [other, setOther] = useState<{ kind: 'mood' | 'sleep' | 'appetite'; value: string } | null>(null);

  // Editor states
  const [cycleEditor, setCycleEditor] = useState(false);
  const [medEditor, setMedEditor] = useState(false);
  const [apptEditor, setApptEditor] = useState(false);
  const [symptomEditor, setSymptomEditor] = useState(false);
  const [cycleForm, setCycleForm] = useState({ period_started_on: '', period_length_days: '', cycle_length_days: '28' });
  const [medForm, setMedForm] = useState('');
  const [apptForm, setApptForm] = useState({ label: '', date: '' });
  const [symptomForm, setSymptomForm] = useState('');

  useFocusEffect(useCallback(() => { loadLogs(); }, []));

  const loadLogs = async () => {
    try {
      const res = await apiClient.get(`/body-logs/${currentUserId}`);
      setBodyLogs(res.data);
    } catch (e) { console.error(e); }
  };

  const latest = bodyLogs[0];
  const today = new Date().toISOString().split('T')[0];

  const cycleInfo = useMemo(() => {
    if (!latest?.period_started_on) return null;
    try {
      const start = new Date(latest.period_started_on);
      const tdy = new Date();
      const cycleLen = latest.cycle_length_days || 28;
      const dayOfCycle = (daysBetween(start, tdy) % cycleLen) + 1;
      const nextStart = new Date(start);
      while (nextStart < tdy) nextStart.setDate(nextStart.getDate() + cycleLen);
      const daysUntilNext = daysBetween(tdy, nextStart);
      return { dayOfCycle, cycleLen, daysUntilNext, nextDate: nextStart.toISOString().split('T')[0] };
    } catch { return null; }
  }, [latest]);

  const upsertField = async (field: string, value: any) => {
    const base = latest && latest.date === today ? latest : null;
    const payload: any = { ...(base || {}), date: today, [field]: value };
    delete payload.id; delete payload.user_id; delete payload.created_at; delete payload.updated_at;
    if (base) await apiClient.put(`/body-logs/${base.id}`, payload);
    else await apiClient.post(`/body-logs?user_id=${currentUserId}`, payload);
    loadLogs();
  };

  const askPepper = async () => {
    if (!latest) {
      Alert.alert('Log something first', 'PEPPER needs notes to read.');
      return;
    }
    setAdvice(null);
    setAdviceLoading(true);
    try {
      const res = await apiClient.post(`/pepper/advise-body?user_id=${currentUserId}`, {
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
      });
      setAdvice(res.data);
    } catch (e) {
      Alert.alert('PEPPER is checking on you', 'Try again in a sec.');
    } finally {
      setAdviceLoading(false);
    }
  };

  const saveCycle = async () => {
    const base = latest && latest.date === today ? latest : null;
    const payload: any = {
      ...(base || {}),
      date: today,
      period_started_on: cycleForm.period_started_on || base?.period_started_on || null,
      period_length_days: cycleForm.period_length_days ? parseInt(cycleForm.period_length_days) : (base?.period_length_days || null),
      cycle_length_days: cycleForm.cycle_length_days ? parseInt(cycleForm.cycle_length_days) : (base?.cycle_length_days || 28),
    };
    delete payload.id; delete payload.user_id; delete payload.created_at; delete payload.updated_at;
    if (base) await apiClient.put(`/body-logs/${base.id}`, payload);
    else await apiClient.post(`/body-logs?user_id=${currentUserId}`, payload);
    setCycleEditor(false);
    loadLogs();
  };

  const addMed = async () => {
    if (!medForm.trim()) return;
    const base = latest && latest.date === today ? latest : null;
    const meds = [...(base?.medications || []), medForm.trim()];
    await upsertField('medications', meds);
    setMedForm('');
    setMedEditor(false);
  };

  const removeMed = async (i: number) => {
    if (!latest) return;
    const meds = (latest.medications || []).filter((_: any, idx: number) => idx !== i);
    const payload = { ...latest, medications: meds };
    delete (payload as any).id; delete (payload as any).user_id; delete (payload as any).created_at; delete (payload as any).updated_at;
    await apiClient.put(`/body-logs/${latest.id}`, payload);
    loadLogs();
  };

  const addAppt = async () => {
    if (!apptForm.label.trim() || !apptForm.date.trim()) return;
    const base = latest && latest.date === today ? latest : null;
    const appts = [...(base?.appointments || []), { label: apptForm.label, date: apptForm.date }];
    await upsertField('appointments', appts);
    setApptForm({ label: '', date: '' });
    setApptEditor(false);
  };

  const removeAppt = async (i: number) => {
    if (!latest) return;
    const appts = (latest.appointments || []).filter((_: any, idx: number) => idx !== i);
    const payload = { ...latest, appointments: appts };
    delete (payload as any).id; delete (payload as any).user_id; delete (payload as any).created_at; delete (payload as any).updated_at;
    await apiClient.put(`/body-logs/${latest.id}`, payload);
    loadLogs();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>* BODY</Text>
          <Text style={styles.heroTitle}>how's the body?</Text>
          <Text style={styles.heroSub}>your body is not a side quest.</Text>
        </View>

        {/* Mood chip picker */}
        <ChipPicker
          label="MOOD"
          options={MOODS}
          value={latest?.mood}
          onChange={(v) => upsertField('mood', v)}
          allowOther
          onOther={() => setOther({ kind: 'mood', value: '' })}
          variant="lilac"
          testIDPrefix="mood"
        />

        {/* Sleep chip picker */}
        <ChipPicker
          label="SLEEP"
          options={SLEEP}
          value={latest?.sleep}
          onChange={(v) => upsertField('sleep', v)}
          allowOther
          onOther={() => setOther({ kind: 'sleep', value: '' })}
          variant="lilac"
          testIDPrefix="sleep"
        />

        {/* Appetite chip picker */}
        <ChipPicker
          label="APPETITE"
          options={APPETITE}
          value={latest?.appetite}
          onChange={(v) => upsertField('appetite', v)}
          allowOther
          onOther={() => setOther({ kind: 'appetite', value: '' })}
          variant="lilac"
          testIDPrefix="appetite"
        />

        {/* Water stepper */}
        <View style={styles.waterRow}>
          <View style={styles.waterLabel}>
            <Ionicons name="water" size={20} color={Colors.softSpiceLilac} />
            <Text style={styles.waterLabelText}>WATER</Text>
          </View>
          <View style={styles.waterCounter}>
            <TouchableOpacity
              style={styles.waterBtn}
              onPress={() => upsertField('water', Math.max(0, (latest?.water || 0) - 1))}
            >
              <Ionicons name="remove" size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.waterValue}>{latest?.water || 0}</Text>
            <TouchableOpacity
              style={styles.waterBtn}
              onPress={() => upsertField('water', (latest?.water || 0) + 1)}
            >
              <Ionicons name="add" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Cycle */}
        {cycleInfo ? (
          <CategoryCard
            title={`DAY ${cycleInfo.dayOfCycle}`}
            subtitle={`of a ${cycleInfo.cycleLen}-day cycle · next in ${cycleInfo.daysUntilNext}d`}
            icon="ellipse"
            variant="lilac"
            onPress={() => setCycleEditor(true)}
          />
        ) : (
          <CategoryCard
            title="TRACK CYCLE"
            subtitle="period start, length, cycle days"
            icon="calendar"
            variant="dark"
            onPress={() => setCycleEditor(true)}
          />
        )}

        {/* Symptoms */}
        <CategoryCard
          title={latest?.symptoms ? 'SYMPTOMS' : 'ADD SYMPTOMS'}
          subtitle={latest?.symptoms || 'headache, cramps, anything weird'}
          icon="medkit"
          variant="dark"
          onPress={() => { setSymptomForm(latest?.symptoms || ''); setSymptomEditor(true); }}
        />

        {/* Meds */}
        <Text style={styles.sectionLabel}>MEDS & JABS.</Text>
        {(latest?.medications || []).map((m: string, i: number) => (
          <CategoryCard
            key={i}
            title={m}
            icon="medical"
            variant="dark"
            rightSlot={
              <TouchableOpacity onPress={() => removeMed(i)}>
                <Ionicons name="close-circle" size={22} color={Colors.steelBlueGrey} />
              </TouchableOpacity>
            }
          />
        ))}
        <CategoryCard title="+ ADD MED" subtitle="Ozempic, vitamins, pills" icon="add-circle" variant="lime" onPress={() => setMedEditor(true)} />

        {/* Appointments */}
        <Text style={styles.sectionLabel}>APPOINTMENTS.</Text>
        {(latest?.appointments || []).map((a: any, i: number) => {
          const today = new Date();
          const daysAway = a.date ? daysBetween(today, new Date(a.date)) : null;
          const overdue = daysAway != null && daysAway < 0;
          return (
            <CategoryCard
              key={i}
              title={a.label}
              subtitle={`${a.date}${daysAway != null ? (overdue ? ` · ${Math.abs(daysAway)}d ago` : daysAway === 0 ? ' · today' : ` · in ${daysAway}d`) : ''}`}
              icon="time"
              variant={overdue ? 'red' : 'dark'}
              rightSlot={
                <TouchableOpacity onPress={() => removeAppt(i)}>
                  <Ionicons name="close-circle" size={22} color={Colors.steelBlueGrey} />
                </TouchableOpacity>
              }
            />
          );
        })}
        <CategoryCard title="+ NEW APPOINTMENT" subtitle="GP, gyno, dentist, therapy" icon="calendar" variant="lilac" onPress={() => setApptEditor(true)} />

        {/* Ask PEPPER — analyzes everything together */}
        <View style={{ marginTop: Spacing.lg }}>
          {adviceLoading ? (
            <View style={styles.loadingBubble}>
              <ActivityIndicator color={Colors.softSpiceLilac} />
              <Text style={styles.loadingText}>PEPPER IS READING THE BODY...</Text>
            </View>
          ) : advice ? (
            <>
              <PepperBubble label="* PEPPER" variant="lilac">{advice.vibe_read}</PepperBubble>
              <Text style={styles.sectionLabel}>CARE MOVES.</Text>
              {advice.care_moves.map((m, i) => (
                <View key={i} style={styles.move}>
                  <View style={styles.moveDot} />
                  <Text style={styles.moveText}>{m}</Text>
                </View>
              ))}
              {advice.doctor_flag && (
                <CategoryCard title="SEE A DOCTOR" subtitle={advice.doctor_flag} icon="medical" variant="red" />
              )}
              <PepperBubble variant="dark" small style={{ marginTop: Spacing.md }}>{advice.permission}</PepperBubble>
              <Button title="ASK AGAIN" onPress={askPepper} variant="ghost" />
            </>
          ) : (
            <CategoryCard
              title="ASK PEPPER"
              subtitle="reads everything together. mood + cycle + meds + symptoms."
              icon="flame"
              variant="red"
              onPress={askPepper}
              testID="body-ask-pepper"
            />
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Other (custom) chip input */}
      <Modal visible={!!other} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.editorScroll, { justifyContent: 'center', flex: 1 }]}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>CUSTOM {other?.kind?.toUpperCase()}</Text>
              <Input
                value={other?.value || ''}
                onChangeText={(t) => setOther((o) => (o ? { ...o, value: t } : null))}
                placeholder="describe it"
                autoFocus
              />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setOther(null)} variant="ghost" />
                <Button title="SAVE" onPress={() => {
                  if (other?.value.trim()) {
                    upsertField(other.kind, other.value.trim());
                  }
                  setOther(null);
                }} variant="primary" />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cycle editor */}
      <Modal visible={cycleEditor} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>CYCLE</Text>
              <Input label="LAST PERIOD STARTED (YYYY-MM-DD)" value={cycleForm.period_started_on} onChangeText={(t) => setCycleForm({ ...cycleForm, period_started_on: t })} placeholder="2026-05-15" />
              <Input label="PERIOD LENGTH (DAYS)" value={cycleForm.period_length_days} onChangeText={(t) => setCycleForm({ ...cycleForm, period_length_days: t })} keyboardType="number-pad" placeholder="5" />
              <Input label="CYCLE LENGTH (DAYS)" value={cycleForm.cycle_length_days} onChangeText={(t) => setCycleForm({ ...cycleForm, cycle_length_days: t })} keyboardType="number-pad" placeholder="28" />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setCycleEditor(false)} variant="ghost" />
                <Button title="SAVE" onPress={saveCycle} variant="primary" />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Symptom editor */}
      <Modal visible={symptomEditor} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>SYMPTOMS</Text>
              <Input value={symptomForm} onChangeText={setSymptomForm} placeholder="what's going on" multiline />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setSymptomEditor(false)} variant="ghost" />
                <Button title="SAVE" onPress={async () => { await upsertField('symptoms', symptomForm); setSymptomEditor(false); }} variant="primary" />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Med editor */}
      <Modal visible={medEditor} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>NEW MED</Text>
              <Input value={medForm} onChangeText={setMedForm} placeholder="e.g. Ozempic 0.5mg weekly" autoFocus />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setMedEditor(false)} variant="ghost" />
                <Button title="ADD" onPress={addMed} variant="primary" />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Appt editor */}
      <Modal visible={apptEditor} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>NEW APPT</Text>
              <Input label="LABEL" value={apptForm.label} onChangeText={(t) => setApptForm({ ...apptForm, label: t })} placeholder="GP follow-up" autoFocus />
              <Input label="DATE (YYYY-MM-DD)" value={apptForm.date} onChangeText={(t) => setApptForm({ ...apptForm, date: t })} placeholder="2026-06-15" />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setApptEditor(false)} variant="ghost" />
                <Button title="ADD" onPress={addAppt} variant="primary" />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Layout.screenPadding, paddingBottom: 120 },
  hero: { marginBottom: Spacing.lg },
  heroLabel: { fontSize: Typography.fontSize.xs, color: Colors.softSpiceLilac, fontWeight: '800', letterSpacing: 3, marginBottom: 6 },
  heroTitle: { fontSize: Typography.fontSize.display, fontWeight: '900', color: Colors.text, letterSpacing: 1 },
  heroSub: { fontSize: Typography.fontSize.base, color: Colors.textSubtle, fontStyle: 'italic', marginTop: 4 },
  sectionLabel: {
    fontSize: Typography.fontSize.xs, color: Colors.softSpiceLilac,
    fontWeight: '800', letterSpacing: 2,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  waterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.charcoalRaised,
    padding: Layout.cardPadding,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  waterLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  waterLabelText: { color: Colors.text, fontWeight: '800', fontSize: Typography.fontSize.sm, letterSpacing: 1 },
  waterCounter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  waterBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.inkBlack, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  waterValue: { color: Colors.text, fontSize: Typography.fontSize.xl, fontWeight: '900', minWidth: 30, textAlign: 'center' },
  loadingBubble: { padding: Spacing.xl, alignItems: 'center', backgroundColor: Colors.charcoalRaised, borderRadius: BorderRadius.xl },
  loadingText: { color: Colors.softSpiceLilac, fontSize: Typography.fontSize.sm, fontWeight: '800', letterSpacing: 2, marginTop: Spacing.sm },
  move: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.charcoalRaised,
    padding: Layout.cardPadding, borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xs,
  },
  moveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.softSpiceLilac, marginRight: Spacing.sm },
  moveText: { flex: 1, fontSize: Typography.fontSize.base, color: Colors.text, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  editorScroll: { padding: Layout.screenPadding, paddingTop: 80 },
  editorCard: { backgroundColor: Colors.charcoal, borderRadius: BorderRadius.xl, padding: Layout.cardPaddingLarge },
  editorTitle: { fontSize: Typography.fontSize.xl, fontWeight: '900', color: Colors.text, letterSpacing: 1, marginBottom: Spacing.lg },
  editorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
});
