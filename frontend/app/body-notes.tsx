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
import { DatePicker } from '../src/components/DatePicker';
import apiClient from '../src/services/api';
import { useAppStore } from '../src/store/appStore';
import { updateProfile } from '../src/services/auth';

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

// Local-time YYYY-MM-DD (not UTC).
function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "last taken" as a friendly relative string.
function lastTakenLabel(med: any): string {
  const hist = (med.intake_history || []).slice()
    .sort((a: any, b: any) => String(b.taken_at || b.date).localeCompare(String(a.taken_at || a.date)));
  if (!hist.length) return 'never';
  const t = new Date(hist[0].taken_at || hist[0].date);
  if (isNaN(t.getTime())) return 'recently';
  const mins = Math.floor((Date.now() - t.getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

// "next due" based on frequency + whether it's been taken today.
function nextDueLabel(med: any, takenToday: boolean): string {
  if (med.frequency === 'as_needed') return 'as needed';
  const when = med.time_of_day ? ` ${med.time_of_day}` : '';
  if (med.frequency === 'weekly') return takenToday ? 'next: next week' : `due this week${when}`;
  if (med.frequency === 'monthly') return takenToday ? 'next: next month' : `due this month${when}`;
  return takenToday ? `next: tomorrow${when}` : `due today${when}`;
}

export default function BodyScreen() {
  const { currentUserId, pepperSpiceLevel, user, setAuthUser } = useAppStore();
  const [statsEditor, setStatsEditor] = useState<{ kind: 'height' | 'weight'; value: string } | null>(null);
  const [bodyLogs, setBodyLogs] = useState<any[]>([]);
  const [advice, setAdvice] = useState<BodyAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [other, setOther] = useState<{ kind: 'mood' | 'sleep' | 'appetite'; value: string } | null>(null);

  // Editor states
  const [cycleEditor, setCycleEditor] = useState(false);
  const [medEditor, setMedEditor] = useState<{ open: boolean; editingId: string | null }>({ open: false, editingId: null });
  const [apptEditor, setApptEditor] = useState(false);
  const [symptomEditor, setSymptomEditor] = useState(false);
  const [cycleForm, setCycleForm] = useState({ period_started_on: '', period_length_days: '', cycle_length_days: '28' });
  const [medForm, setMedForm] = useState({
    name: '',
    dosage: '',
    frequency: 'daily' as 'daily' | 'weekly' | 'monthly' | 'as_needed',
    time_of_day: '',
    notes: '',
  });
  const [meds, setMeds] = useState<any[]>([]);
  const [apptForm, setApptForm] = useState({ label: '', date: '' });
  const [symptomForm, setSymptomForm] = useState('');

  useFocusEffect(useCallback(() => { loadLogs(); loadMeds(); }, []));

  const loadLogs = async () => {
    try {
      const res = await apiClient.get(`/body-logs/${currentUserId}`);
      setBodyLogs(res.data);
    } catch (e) { console.error(e); }
  };

  const loadMeds = async () => {
    try {
      const res = await apiClient.get(`/medications/${currentUserId}`);
      setMeds(res.data || []);
    } catch (e) { console.error(e); }
  };

  const today = localDate();
  const latest = bodyLogs[0]; // most recent log (any date)
  // Daily fields (mood/sleep/appetite/water/symptoms) come from TODAY's log so
  // they reset each day; persistent things read from the most recent entry that has them.
  const todayLog = bodyLogs.find((l: any) => l.date === today);
  const cycleLog = bodyLogs.find((l: any) => l.period_started_on);
  const weightLog = bodyLogs.find((l: any) => typeof l.weight_optional === 'number');

  const cycleInfo = useMemo(() => {
    if (!cycleLog?.period_started_on) return null;
    try {
      const start = new Date(cycleLog.period_started_on);
      const tdy = new Date();
      const cycleLen = cycleLog.cycle_length_days || 28;
      const dayOfCycle = (daysBetween(start, tdy) % cycleLen) + 1;
      const nextStart = new Date(start);
      while (nextStart < tdy) nextStart.setDate(nextStart.getDate() + cycleLen);
      const daysUntilNext = daysBetween(tdy, nextStart);
      return { dayOfCycle, cycleLen, daysUntilNext, nextDate: nextStart.toISOString().split('T')[0] };
    } catch { return null; }
  }, [cycleLog]);

  const upsertField = async (field: string, value: any) => {
    const base = latest && latest.date === today ? latest : null;
    const payload: any = { ...(base || {}), date: today, [field]: value };
    delete payload.id; delete payload.user_id; delete payload.created_at; delete payload.updated_at;
    if (base) await apiClient.put(`/body-logs/${base.id}`, payload);
    else await apiClient.post(`/body-logs?user_id=${currentUserId}`, payload);
    loadLogs();
  };

  // ---- Body stats: height (profile, cm) + weight (daily log, kg) + BMI ----
  const unit: 'metric' | 'imperial' = user?.unit_system === 'imperial' ? 'imperial' : 'metric';
  const heightCm = user?.height_cm || null;
  const weightKg = weightLog && typeof weightLog.weight_optional === 'number' ? weightLog.weight_optional : null;
  const bmi = heightCm && weightKg ? weightKg / Math.pow(heightCm / 100, 2) : null;
  const bmiCategory = bmi == null ? '' : bmi < 18.5 ? 'under' : bmi < 25 ? 'in range' : bmi < 30 ? 'over' : 'high';
  const bmiColor = bmi == null ? Colors.text : bmi >= 18.5 && bmi < 25 ? Colors.pickleLime : bmi >= 30 ? Colors.brightRed : Colors.softSpiceLilac;

  const fmtHeight = () => {
    if (!heightCm) return 'set height';
    if (unit === 'imperial') {
      const totalIn = heightCm / 2.54;
      return `${Math.floor(totalIn / 12)}'${Math.round(totalIn % 12)}"`;
    }
    return `${Math.round(heightCm)} cm`;
  };
  const fmtWeight = () => {
    if (weightKg == null) return 'log weight';
    return unit === 'imperial' ? `${Math.round(weightKg * 2.2046)} lb` : `${Math.round(weightKg * 10) / 10} kg`;
  };

  const toggleUnit = async () => {
    const next = unit === 'imperial' ? 'metric' : 'imperial';
    try { const u = await updateProfile({ unit_system: next }); setAuthUser(u as any); } catch {}
  };

  const openStat = (kind: 'height' | 'weight') => {
    if (kind === 'height') {
      setStatsEditor({ kind, value: heightCm ? String(unit === 'imperial' ? Math.round(heightCm / 2.54) : Math.round(heightCm)) : '' });
    } else {
      setStatsEditor({ kind, value: weightKg != null ? String(unit === 'imperial' ? Math.round(weightKg * 2.2046) : Math.round(weightKg * 10) / 10) : '' });
    }
  };

  const saveStat = async () => {
    if (!statsEditor) return;
    const num = parseFloat(statsEditor.value);
    if (isNaN(num) || num <= 0) { setStatsEditor(null); return; }
    if (statsEditor.kind === 'height') {
      const cm = unit === 'imperial' ? num * 2.54 : num;
      try { const u = await updateProfile({ height_cm: Math.round(cm * 10) / 10 }); setAuthUser(u as any); } catch {}
    } else {
      const kg = unit === 'imperial' ? num / 2.2046 : num;
      await upsertField('weight_optional', Math.round(kg * 10) / 10);
    }
    setStatsEditor(null);
  };

  const askPepper = async () => {
    if (!latest && meds.length === 0) {
      Alert.alert('Log something first', 'PEPPER needs notes to read.');
      return;
    }
    setAdvice(null);
    setAdviceLoading(true);
    try {
      const medsContext = meds.map((m: any) => {
        const takenToday = (m.intake_history || []).some((h: any) => h.date === today);
        const { streak } = computeStreak(m);
        return `${m.name}${m.dosage ? ` ${m.dosage}` : ''} (${m.frequency}${m.time_of_day ? ` ${m.time_of_day}` : ''}) — ${takenToday ? 'TAKEN today' : 'not taken today'}${streak > 0 ? `, ${streak}d streak` : ''}`;
      });
      const res = await apiClient.post(`/pepper/advise-body?user_id=${currentUserId}`, {
        sleep: todayLog?.sleep,
        appetite: todayLog?.appetite,
        symptoms: todayLog?.symptoms,
        mood: todayLog?.mood,
        water: todayLog?.water,
        period_started_on: cycleLog?.period_started_on,
        period_length_days: cycleLog?.period_length_days,
        cycle_length_days: cycleLog?.cycle_length_days,
        medications: medsContext.length > 0 ? medsContext : latest?.medications,
        appointments: latest?.appointments,
        notes: todayLog?.notes,
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

  const openMedEditor = (med?: any) => {
    if (med) {
      setMedForm({
        name: med.name || '',
        dosage: med.dosage || '',
        frequency: med.frequency || 'daily',
        time_of_day: med.time_of_day || '',
        notes: med.notes || '',
      });
      setMedEditor({ open: true, editingId: med.id });
    } else {
      setMedForm({ name: '', dosage: '', frequency: 'daily', time_of_day: '', notes: '' });
      setMedEditor({ open: true, editingId: null });
    }
  };

  const saveMed = async () => {
    if (!medForm.name.trim()) return;
    const payload: any = {
      name: medForm.name.trim(),
      dosage: medForm.dosage.trim() || undefined,
      frequency: medForm.frequency,
      time_of_day: medForm.time_of_day || undefined,
      notes: medForm.notes.trim() || undefined,
      active: true,
    };
    try {
      if (medEditor.editingId) {
        await apiClient.put(`/medications/${medEditor.editingId}`, payload);
      } else {
        await apiClient.post(`/medications?user_id=${currentUserId}`, payload);
      }
      setMedEditor({ open: false, editingId: null });
      setMedForm({ name: '', dosage: '', frequency: 'daily', time_of_day: '', notes: '' });
      loadMeds();
    } catch (e) {
      console.error('saveMed err', e);
    }
  };

  const removeMed = async (medId: string) => {
    try {
      await apiClient.delete(`/medications/${medId}`);
      setMedEditor({ open: false, editingId: null });
      loadMeds();
    } catch (e) { console.error(e); }
  };

  const toggleMedTaken = async (med: any) => {
    const takenToday = (med.intake_history || []).some((h: any) => h.date === today);
    try {
      if (takenToday) {
        await apiClient.delete(`/medications/${med.id}/take?date=${today}`);
      } else {
        await apiClient.post(`/medications/${med.id}/take`, { date: today });
      }
      loadMeds();
    } catch (e) { console.error(e); }
  };

  // 7-day streak
  const computeStreak = (med: any): { taken7: number; streak: number } => {
    const history: any[] = med.intake_history || [];
    const datesSet = new Set(history.map((h) => h.date));
    let taken7 = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      if (datesSet.has(iso)) taken7++;
    }
    let streak = 0;
    let d = new Date();
    while (true) {
      const iso = d.toISOString().split('T')[0];
      if (datesSet.has(iso)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        // If today isn't taken, streak is still last consecutive
        if (streak === 0 && d.toDateString() === new Date().toDateString()) {
          d.setDate(d.getDate() - 1);
          continue;
        }
        break;
      }
    }
    return { taken7, streak };
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

        {/* Body stats: height / weight / BMI */}
        <View style={styles.statsHeaderRow}>
          <Text style={styles.sectionLabel}>BODY STATS.</Text>
          <TouchableOpacity onPress={toggleUnit} style={styles.unitToggle}>
            <Ionicons name="swap-horizontal" size={12} color={Colors.text} />
            <Text style={styles.unitToggleText}>{unit === 'imperial' ? 'lb / ft·in' : 'kg / cm'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statTile} onPress={() => openStat('height')}>
            <Text style={styles.statLabel}>HEIGHT</Text>
            <Text style={styles.statValue}>{fmtHeight()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statTile} onPress={() => openStat('weight')}>
            <Text style={styles.statLabel}>WEIGHT</Text>
            <Text style={styles.statValue}>{fmtWeight()}</Text>
          </TouchableOpacity>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>BMI</Text>
            <Text style={[styles.statValue, { color: bmiColor }]}>{bmi != null ? (Math.round(bmi * 10) / 10).toFixed(1) : '—'}</Text>
            {bmi != null && <Text style={[styles.bmiCat, { color: bmiColor }]}>{bmiCategory}</Text>}
          </View>
        </View>
        {bmi != null && (
          <Text style={styles.bmiCaveat}>BMI is a rough flag — it can't see muscle, water, or your whole story. data, not a verdict.</Text>
        )}

        {/* Mood chip picker */}
        <ChipPicker
          label="MOOD"
          options={MOODS}
          value={todayLog?.mood}
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
          value={todayLog?.sleep}
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
          value={todayLog?.appetite}
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
              onPress={() => upsertField('water', Math.max(0, (todayLog?.water || 0) - 1))}
            >
              <Ionicons name="remove" size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.waterValue}>{todayLog?.water || 0}</Text>
            <TouchableOpacity
              style={styles.waterBtn}
              onPress={() => upsertField('water', (todayLog?.water || 0) + 1)}
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
          title={todayLog?.symptoms ? 'SYMPTOMS' : 'ADD SYMPTOMS'}
          subtitle={todayLog?.symptoms || 'headache, cramps, anything weird'}
          icon="medkit"
          variant="dark"
          onPress={() => { setSymptomForm(todayLog?.symptoms || ''); setSymptomEditor(true); }}
        />

        {/* Meds — full tracker with schedule + intake history */}
        <Text style={styles.sectionLabel}>MEDICATIONS.</Text>
        <Text style={styles.sectionHint}>tap "TAKE" when you take it. pepper tracks last + next.</Text>
        {meds.map((m: any) => {
          const takenToday = (m.intake_history || []).some((h: any) => h.date === today);
          const dosageLabel = m.dosage ? `${m.dosage}  ·  ` : '';
          const last = lastTakenLabel(m);
          const next = nextDueLabel(m, takenToday);
          return (
            <CategoryCard
              key={m.id}
              title={m.name}
              subtitle={`${dosageLabel}last: ${last}  ·  ${next}`}
              icon="medical"
              variant={takenToday ? 'lime' : 'dark'}
              onPress={() => openMedEditor(m)}
              rightSlot={
                <TouchableOpacity
                  onPress={() => toggleMedTaken(m)}
                  style={[styles.takeBtn, takenToday && styles.takeBtnDone]}
                >
                  {takenToday ? (
                    <Ionicons name="checkmark" size={18} color={Colors.inkBlack} />
                  ) : (
                    <Text style={styles.takeBtnText}>TAKE</Text>
                  )}
                </TouchableOpacity>
              }
            />
          );
        })}
        <CategoryCard
          title="+ ADD MEDICATION"
          subtitle="name, dosage, daily/weekly/monthly/as-needed"
          icon="add-circle"
          variant="lilac"
          onPress={() => openMedEditor()}
        />

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
              <DatePicker
                label="LAST PERIOD STARTED"
                value={cycleForm.period_started_on}
                onChange={(v) => setCycleForm({ ...cycleForm, period_started_on: v })}
                placeholder="Pick the start date"
                variant="lilac"
              />
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

      {/* Med editor — full schedule + dosage */}
      <Modal visible={medEditor.open} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>
                {medEditor.editingId ? 'EDIT MEDICATION' : 'NEW MEDICATION'}
              </Text>
              <Input
                label="NAME"
                value={medForm.name}
                onChangeText={(t) => setMedForm({ ...medForm, name: t })}
                placeholder="Ozempic, Vitamin D, Lexapro..."
                autoFocus
              />
              <Input
                label="DOSAGE"
                value={medForm.dosage}
                onChangeText={(t) => setMedForm({ ...medForm, dosage: t })}
                placeholder="0.5mg / 2 pills / 1 capsule"
              />
              <ChipPicker
                label="FREQUENCY"
                options={['daily', 'weekly', 'monthly', 'as_needed']}
                value={medForm.frequency}
                onChange={(v) => setMedForm({ ...medForm, frequency: v as any })}
                variant="lilac"
                testIDPrefix="med-freq"
              />
              <ChipPicker
                label="TIME OF DAY"
                options={['morning', 'midday', 'evening', 'bedtime', 'anytime']}
                value={medForm.time_of_day || 'anytime'}
                onChange={(v) => setMedForm({ ...medForm, time_of_day: v === 'anytime' ? '' : v })}
                variant="lilac"
                testIDPrefix="med-time"
              />
              <Input
                label="NOTES"
                value={medForm.notes}
                onChangeText={(t) => setMedForm({ ...medForm, notes: t })}
                placeholder="with food, side effects to watch, etc"
              />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setMedEditor({ open: false, editingId: null })} variant="ghost" />
                <Button title="SAVE" onPress={saveMed} variant="primary" />
              </View>
              {medEditor.editingId && (
                <Button
                  title="DELETE"
                  onPress={() => removeMed(medEditor.editingId!)}
                  variant="danger"
                  style={{ marginTop: Spacing.md }}
                />
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Appt editor */}
      <Modal visible={apptEditor} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>NEW APPT</Text>
              <Input label="LABEL" value={apptForm.label} onChangeText={(t) => setApptForm({ ...apptForm, label: t })} placeholder="GP follow-up" autoFocus />
              <DatePicker
                label="DATE"
                value={apptForm.date}
                onChange={(v) => setApptForm({ ...apptForm, date: v })}
                placeholder="When?"
                variant="lilac"
              />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setApptEditor(false)} variant="ghost" />
                <Button title="ADD" onPress={addAppt} variant="primary" />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Body stat editor (height / weight) */}
      <Modal visible={!!statsEditor} animationType="slide" transparent onRequestClose={() => setStatsEditor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>{statsEditor?.kind === 'height' ? 'YOUR HEIGHT' : "TODAY'S WEIGHT"}</Text>
              <Input
                label={
                  statsEditor?.kind === 'height'
                    ? unit === 'imperial' ? 'HEIGHT (inches, e.g. 67)' : 'HEIGHT (cm)'
                    : unit === 'imperial' ? 'WEIGHT (lb)' : 'WEIGHT (kg)'
                }
                value={statsEditor?.value || ''}
                onChangeText={(t) => setStatsEditor((s) => (s ? { ...s, value: t } : s))}
                keyboardType="decimal-pad"
                placeholder="0"
                autoFocus
              />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setStatsEditor(null)} variant="ghost" />
                <Button title="SAVE" onPress={saveStat} variant="primary" />
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
  sectionHint: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontStyle: 'italic', marginBottom: Spacing.md },
  statsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unitToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.lg },
  unitToggleText: { fontSize: Typography.fontSize.xs, color: Colors.text, fontWeight: '700', letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  statTile: { flex: 1, backgroundColor: Colors.charcoalRaised, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center' },
  statLabel: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  statValue: { fontSize: Typography.fontSize.lg, color: Colors.text, fontWeight: '800' },
  bmiCat: { fontSize: Typography.fontSize.xs, fontWeight: '700', marginTop: 2 },
  bmiCaveat: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontStyle: 'italic', marginBottom: Spacing.sm },
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
  takeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.softSpiceLilac,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeBtnDone: {
    backgroundColor: Colors.pickleLime,
    borderColor: Colors.pickleLime,
  },
  takeBtnText: {
    color: Colors.softSpiceLilac,
    fontSize: Typography.fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
