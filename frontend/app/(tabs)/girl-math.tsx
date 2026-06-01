import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal, TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { CategoryCard } from '../../src/components/CategoryCard';
import { PepperBubble } from '../../src/components/PepperBubble';
import { ChipPicker } from '../../src/components/ChipPicker';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import apiClient from '../../src/services/api';
import { useAppStore } from '../../src/store/appStore';
import { detectCurrency, formatMoney } from '../../src/utils/locale';

const REGRET_LABELS = ['none', 'a lil', 'medium', 'big', 'huge'];

export default function GirlMathScreen() {
  const { currentUserId } = useAppStore();
  const [entry, setEntry] = useState<any>(null);
  const [currency, setCurrency] = useState(detectCurrency());

  // Conversational intake state
  const [step, setStep] = useState(0); // 0=cash, 1=bills, 2=income, 3=done

  // Doom + Soft modals
  const [doomModal, setDoomModal] = useState(false);
  const [doomForm, setDoomForm] = useState({ label: '', amount: '', regret: 2 });
  const [softModal, setSoftModal] = useState(false);
  const [softForm, setSoftForm] = useState({ label: '', amount: '' });

  // Quick-edit modal for cash/bills/income
  const [editField, setEditField] = useState<'cash_available' | 'upcoming_bills' | 'expected_income' | null>(null);
  const [editValue, setEditValue] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useFocusEffect(useCallback(() => { loadEntry(); }, []));

  const loadEntry = async () => {
    try {
      const res = await apiClient.get(`/money-entries/${currentUserId}`);
      if (res.data && res.data.length > 0) {
        setEntry(res.data[0]);
        if (res.data[0].currency) setCurrency(res.data[0].currency);
      }
    } catch (e) {}
  };

  const upsertField = async (patch: any) => {
    const base = entry && entry.date === today ? entry : null;
    const payload: any = { ...(base || {}), date: today, currency, ...patch };
    delete payload.id; delete payload.user_id; delete payload.created_at; delete payload.updated_at;
    if (base) {
      const r = await apiClient.put(`/money-entries/${base.id}`, payload);
      setEntry(r.data);
    } else {
      const r = await apiClient.post(`/money-entries?user_id=${currentUserId}`, payload);
      setEntry(r.data);
    }
  };

  const floor = (entry?.cash_available || 0) - (entry?.upcoming_bills || 0);
  const totalDoom = (entry?.doom_spends || []).reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const totalSoft = (entry?.soft_savings || []).reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const floorAfterDoom = floor - totalDoom;

  // Show conversational intake if no entry yet
  const showIntake = !entry || (entry.cash_available == null && entry.upcoming_bills == null && entry.expected_income == null);

  const saveDoom = async () => {
    if (!doomForm.label.trim() || !doomForm.amount.trim()) {
      Alert.alert('Hold up', 'Need a label and amount.');
      return;
    }
    const ds = [...(entry?.doom_spends || []), {
      label: doomForm.label,
      amount: parseFloat(doomForm.amount) || 0,
      regret: doomForm.regret,
      date: today,
    }];
    await upsertField({ doom_spends: ds });
    setDoomModal(false);
    setDoomForm({ label: '', amount: '', regret: 2 });
  };

  const saveSoft = async () => {
    if (!softForm.label.trim() || !softForm.amount.trim()) {
      Alert.alert('Hold up', 'Need a label and amount.');
      return;
    }
    const ss = [...(entry?.soft_savings || []), {
      label: softForm.label,
      amount: parseFloat(softForm.amount) || 0,
      date: today,
    }];
    await upsertField({ soft_savings: ss });
    setSoftModal(false);
    setSoftForm({ label: '', amount: '' });
  };

  const removeDoom = async (i: number) => {
    const ds = (entry?.doom_spends || []).filter((_: any, idx: number) => idx !== i);
    await upsertField({ doom_spends: ds });
  };

  const removeSoft = async (i: number) => {
    const ss = (entry?.soft_savings || []).filter((_: any, idx: number) => idx !== i);
    await upsertField({ soft_savings: ss });
  };

  const saveEditField = async () => {
    if (!editField) return;
    const val = parseFloat(editValue);
    await upsertField({ [editField]: isNaN(val) ? null : val });
    setEditField(null);
    setEditValue('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>* GIRL MATH</Text>
          <Text style={styles.heroTitle}>the floor is the floor.</Text>
          <Text style={styles.heroSub}>cash − bills − doom. that's it.</Text>
        </View>

        {showIntake ? (
          <>
            <PepperBubble label="* PEPPER" variant="red">
              Let's not do a whole budget. Just three numbers. Tap to fill in.
            </PepperBubble>

            <CategoryCard
              title={entry?.cash_available != null ? formatMoney(entry.cash_available, currency) : 'Tap me'}
              subtitle="1. CASH AVAILABLE NOW"
              icon="wallet"
              variant={entry?.cash_available != null ? 'lime' : 'dark'}
              onPress={() => { setEditField('cash_available'); setEditValue(entry?.cash_available?.toString() || ''); }}
              large
            />
            <CategoryCard
              title={entry?.upcoming_bills != null ? formatMoney(entry.upcoming_bills, currency) : 'Tap me'}
              subtitle="2. BILLS COMING THIS WEEK"
              icon="receipt"
              variant={entry?.upcoming_bills != null ? 'red' : 'dark'}
              onPress={() => { setEditField('upcoming_bills'); setEditValue(entry?.upcoming_bills?.toString() || ''); }}
              large
            />
            <CategoryCard
              title={entry?.expected_income != null ? formatMoney(entry.expected_income, currency) : 'Skip if none'}
              subtitle="3. MONEY COMING SOON (optional)"
              icon="trending-up"
              variant={entry?.expected_income != null ? 'lilac' : 'dark'}
              onPress={() => { setEditField('expected_income'); setEditValue(entry?.expected_income?.toString() || ''); }}
              large
            />
          </>
        ) : (
          <>
            {/* THE FLOOR — hero number */}
            <View style={styles.floorCard}>
              <Text style={styles.floorLabel}>THE FLOOR</Text>
              <Text style={[styles.floorAmount, floorAfterDoom < 0 && styles.floorAmountNegative]}>
                {formatMoney(floorAfterDoom, currency)}
              </Text>
              <Text style={styles.floorSub}>
                {formatMoney(entry?.cash_available || 0, currency)} cash − {formatMoney(entry?.upcoming_bills || 0, currency)} bills{totalDoom > 0 ? ` − ${formatMoney(totalDoom, currency)} doom` : ''}
              </Text>
              {entry?.expected_income > 0 && (
                <View style={styles.incomeBadge}>
                  <Ionicons name="trending-up" size={14} color={Colors.pickleLime} />
                  <Text style={styles.incomeText}>+{formatMoney(entry.expected_income, currency)} incoming</Text>
                </View>
              )}
            </View>

            {/* Quick edits */}
            <View style={styles.quickRow}>
              <TouchableOpacity style={styles.quickTile} onPress={() => { setEditField('cash_available'); setEditValue(entry?.cash_available?.toString() || ''); }}>
                <Text style={styles.quickLabel}>CASH</Text>
                <Text style={styles.quickValue}>{formatMoney(entry?.cash_available || 0, currency)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickTile} onPress={() => { setEditField('upcoming_bills'); setEditValue(entry?.upcoming_bills?.toString() || ''); }}>
                <Text style={styles.quickLabel}>BILLS</Text>
                <Text style={[styles.quickValue, { color: Colors.brightRed }]}>{formatMoney(entry?.upcoming_bills || 0, currency)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickTile} onPress={() => { setEditField('expected_income'); setEditValue(entry?.expected_income?.toString() || ''); }}>
                <Text style={styles.quickLabel}>INCOMING</Text>
                <Text style={[styles.quickValue, { color: Colors.pickleLime }]}>{formatMoney(entry?.expected_income || 0, currency)}</Text>
              </TouchableOpacity>
            </View>

            {/* Doom Spending */}
            <Text style={styles.sectionLabel}>DOOM SPENDING.</Text>
            <Text style={styles.sectionHint}>impulse buys & 3am amazon. log it. own it.</Text>
            {(entry?.doom_spends || []).map((d: any, i: number) => (
              <CategoryCard
                key={i}
                title={d.label}
                subtitle={`${formatMoney(d.amount, currency)} · ${REGRET_LABELS[d.regret] || 'medium'} regret`}
                icon="flame"
                variant={d.regret >= 3 ? 'red' : 'dark'}
                rightSlot={
                  <TouchableOpacity onPress={() => removeDoom(i)}>
                    <Ionicons name="close-circle" size={22} color={Colors.steelBlueGrey} />
                  </TouchableOpacity>
                }
              />
            ))}
            <CategoryCard title="+ LOG A DOOM SPEND" subtitle={totalDoom > 0 ? `${formatMoney(totalDoom, currency)} this period` : 'no shame. just data.'} icon="add-circle" variant="red" onPress={() => setDoomModal(true)} />

            {/* Soft Saving */}
            <Text style={styles.sectionLabel}>SOFT SAVING.</Text>
            <Text style={styles.sectionHint}>small wins. spare change. didn't buy the latte.</Text>
            {(entry?.soft_savings || []).map((s: any, i: number) => (
              <CategoryCard
                key={i}
                title={s.label}
                subtitle={formatMoney(s.amount, currency)}
                icon="leaf"
                variant="dark"
                rightSlot={
                  <TouchableOpacity onPress={() => removeSoft(i)}>
                    <Ionicons name="close-circle" size={22} color={Colors.steelBlueGrey} />
                  </TouchableOpacity>
                }
              />
            ))}
            <CategoryCard title="+ STASH A SMALL WIN" subtitle={totalSoft > 0 ? `${formatMoney(totalSoft, currency)} stashed` : 'every bit counts.'} icon="add-circle" variant="lime" onPress={() => setSoftModal(true)} />

            {/* PEPPER analysis */}
            <PepperBubble label="* PEPPER" variant={floorAfterDoom < 0 ? 'red' : 'lime'} style={{ marginTop: Spacing.lg }}>
              {floorAfterDoom < 0
                ? `Floor's negative by ${formatMoney(Math.abs(floorAfterDoom), currency)}. Pause spending. Move one bill.`
                : floorAfterDoom < 100
                ? "Tight. Don't be cute with online shopping this week."
                : totalDoom > totalSoft * 2 && totalDoom > 0
                ? `Doom is ${formatMoney(totalDoom, currency)}, saving is ${formatMoney(totalSoft, currency)}. The math is mathing in the wrong direction.`
                : `Floor holds. ${totalSoft > 0 ? `You stashed ${formatMoney(totalSoft, currency)}. Cute.` : 'Try one soft save today.'}`
              }
            </PepperBubble>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Quick-edit modal */}
      <Modal visible={!!editField} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.editorScroll, { justifyContent: 'center', flex: 1 }]}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>
                {editField === 'cash_available' ? 'CASH ON HAND' : editField === 'upcoming_bills' ? 'BILLS THIS WEEK' : 'MONEY COMING IN'}
              </Text>
              <Input
                value={editValue}
                onChangeText={setEditValue}
                keyboardType="decimal-pad"
                placeholder="0.00"
                autoFocus
              />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setEditField(null)} variant="ghost" />
                <Button title="SAVE" onPress={saveEditField} variant="primary" />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Doom modal */}
      <Modal visible={doomModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>DOOM SPEND</Text>
              <Input label="WHAT" value={doomForm.label} onChangeText={(t) => setDoomForm({ ...doomForm, label: t })} placeholder="3am amazon, food delivery..." />
              <Input label="HOW MUCH" value={doomForm.amount} onChangeText={(t) => setDoomForm({ ...doomForm, amount: t })} keyboardType="decimal-pad" placeholder="0.00" />
              <ChipPicker
                label="REGRET LEVEL"
                options={REGRET_LABELS}
                value={REGRET_LABELS[doomForm.regret]}
                onChange={(v) => setDoomForm({ ...doomForm, regret: REGRET_LABELS.indexOf(v) })}
                variant="red"
                testIDPrefix="regret"
              />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setDoomModal(false)} variant="ghost" />
                <Button title="LOG IT" onPress={saveDoom} variant="primary" />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Soft save modal */}
      <Modal visible={softModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>SOFT SAVE</Text>
              <Input label="WHAT" value={softForm.label} onChangeText={(t) => setSoftForm({ ...softForm, label: t })} placeholder="skipped latte, found cash..." />
              <Input label="HOW MUCH" value={softForm.amount} onChangeText={(t) => setSoftForm({ ...softForm, amount: t })} keyboardType="decimal-pad" placeholder="0.00" />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setSoftModal(false)} variant="ghost" />
                <Button title="STASH IT" onPress={saveSoft} variant="primary" />
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
  heroLabel: { fontSize: Typography.fontSize.xs, color: Colors.pickleLime, fontWeight: '800', letterSpacing: 3, marginBottom: 6 },
  heroTitle: { fontSize: Typography.fontSize.display, fontWeight: '900', color: Colors.text, letterSpacing: 1 },
  heroSub: { fontSize: Typography.fontSize.base, color: Colors.textSubtle, fontStyle: 'italic', marginTop: 4 },
  floorCard: {
    backgroundColor: Colors.pickleLime,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
  },
  floorLabel: { fontSize: Typography.fontSize.xs, color: Colors.inkBlack, fontWeight: '800', letterSpacing: 2, opacity: 0.7, marginBottom: Spacing.sm },
  floorAmount: { fontSize: 56, fontWeight: '900', color: Colors.inkBlack, letterSpacing: -1 },
  floorAmountNegative: { color: Colors.brightRed },
  floorSub: { fontSize: Typography.fontSize.sm, color: Colors.inkBlack, opacity: 0.65, marginTop: Spacing.sm, fontWeight: '600' },
  incomeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.inkBlack,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
  },
  incomeText: { color: Colors.pickleLime, fontSize: Typography.fontSize.xs, fontWeight: '700', letterSpacing: 1 },
  quickRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  quickTile: {
    flex: 1,
    backgroundColor: Colors.charcoalRaised,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickLabel: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  quickValue: { fontSize: Typography.fontSize.lg, color: Colors.text, fontWeight: '800' },
  sectionLabel: { fontSize: Typography.fontSize.xs, color: Colors.pickleLime, fontWeight: '800', letterSpacing: 2, marginTop: Spacing.lg },
  sectionHint: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, marginBottom: Spacing.md, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  editorScroll: { padding: Layout.screenPadding, paddingTop: 80 },
  editorCard: { backgroundColor: Colors.charcoal, borderRadius: BorderRadius.xl, padding: Layout.cardPaddingLarge },
  editorTitle: { fontSize: Typography.fontSize.xl, fontWeight: '900', color: Colors.text, letterSpacing: 1, marginBottom: Spacing.lg },
  editorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
});
