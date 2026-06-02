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
import { DatePicker } from '../../src/components/DatePicker';
import apiClient from '../../src/services/api';
import { useAppStore } from '../../src/store/appStore';
import { detectCurrency, formatMoney } from '../../src/utils/locale';

const REGRET_LABELS = ['none', 'a lil', 'medium', 'big', 'huge'];

// ISO week key for current week (YYYY-Wxx) — used to filter doom/soft to "this week"
function isoWeekKey(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function daysFromToday(iso: string): number | null {
  if (!iso) return null;
  try {
    const [y, m, d] = iso.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  } catch { return null; }
}

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

  // Bill + Income modals
  const [billModal, setBillModal] = useState<{ open: boolean; editingIdx: number | null }>({ open: false, editingIdx: null });
  const [billForm, setBillForm] = useState({ label: '', amount: '', due_date: '', recurring: '' });
  const [incomeModal, setIncomeModal] = useState<{ open: boolean; editingIdx: number | null }>({ open: false, editingIdx: null });
  const [incomeForm, setIncomeForm] = useState({ label: '', amount: '', expected_date: '', recurring: '' });

  // Quick-edit modal for cash/bills/income
  const [editField, setEditField] = useState<'cash_available' | 'upcoming_bills' | 'expected_income' | null>(null);
  const [editValue, setEditValue] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useFocusEffect(useCallback(() => { loadEntry(); }, []));
  useEffect(() => { loadEntry(); }, []);

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
    // Always operate on the latest entry — bills/income/doom/soft should persist
    // across days, not get re-created daily.
    if (entry) {
      const payload: any = { ...entry, date: today, currency, ...patch };
      delete payload.id; delete payload.user_id; delete payload.created_at; delete payload.updated_at;
      const r = await apiClient.put(`/money-entries/${entry.id}`, payload);
      setEntry(r.data);
    } else {
      const payload: any = { date: today, currency, ...patch };
      const r = await apiClient.post(`/money-entries?user_id=${currentUserId}`, payload);
      setEntry(r.data);
    }
  };

  const thisWeek = isoWeekKey(new Date());

  // Filter doom/soft to current ISO week. Items without a date default to "this week".
  const allDoom = (entry?.doom_spends || []) as any[];
  const allSoft = (entry?.soft_savings || []) as any[];
  const weeklyDoom = allDoom.filter((d) => !d.date || isoWeekKey(new Date(d.date)) === thisWeek);
  const weeklySoft = allSoft.filter((s) => !s.date || isoWeekKey(new Date(s.date)) === thisWeek);

  const totalDoom = weeklyDoom.reduce((s, d) => s + (d.amount || 0), 0);
  const totalSoft = weeklySoft.reduce((s, d) => s + (d.amount || 0), 0);

  // Itemized bills/income
  const allBills = (entry?.bills || []) as any[];
  const allIncome = (entry?.income || []) as any[];
  const unpaidBills = allBills.filter((b) => !b.paid);
  const paidBills = allBills.filter((b) => b.paid);
  const billsTotal = unpaidBills.reduce((s, b) => s + (b.amount || 0), 0);
  const incomeTotal = allIncome.reduce((s, b) => s + (b.amount || 0), 0);

  // Floor = cash on hand − unpaid bills − this-week doom
  const cash = entry?.cash_available || 0;
  const lumpBills = entry?.upcoming_bills || 0; // fallback if no itemized
  const effectiveBills = unpaidBills.length > 0 ? billsTotal : lumpBills;
  const lumpIncome = entry?.expected_income || 0;
  const effectiveIncome = allIncome.length > 0 ? incomeTotal : lumpIncome;
  const floor = cash - effectiveBills;
  const floorAfterDoom = floor - totalDoom;

  // Show conversational intake if no entry yet
  const showIntake = !entry || (
    entry.cash_available == null &&
    !unpaidBills.length && !allIncome.length &&
    entry.upcoming_bills == null && entry.expected_income == null
  );

  const saveEditField = async () => {
    if (!editField) return;
    const val = parseFloat(editValue);
    await upsertField({ [editField]: isNaN(val) ? null : val });
    setEditField(null);
    setEditValue('');
  };

  const openBillEditor = (idx: number | null) => {
    if (idx != null && allBills[idx]) {
      const b = allBills[idx];
      setBillForm({
        label: b.label || '',
        amount: b.amount != null ? String(b.amount) : '',
        due_date: b.due_date || '',
        recurring: b.recurring || '',
      });
    } else {
      setBillForm({ label: '', amount: '', due_date: '', recurring: '' });
    }
    setBillModal({ open: true, editingIdx: idx });
  };

  const saveBill = async () => {
    if (!billForm.label.trim() || !billForm.amount.trim()) {
      Alert.alert('Hold up', 'Need a label and amount.');
      return;
    }
    const newBill: any = {
      label: billForm.label.trim(),
      amount: parseFloat(billForm.amount) || 0,
      paid: billModal.editingIdx != null ? !!allBills[billModal.editingIdx].paid : false,
    };
    if (billForm.due_date) newBill.due_date = billForm.due_date;
    if (billForm.recurring) newBill.recurring = billForm.recurring;

    const bills = [...allBills];
    if (billModal.editingIdx != null) bills[billModal.editingIdx] = newBill;
    else bills.push(newBill);

    await upsertField({ bills });
    setBillModal({ open: false, editingIdx: null });
  };

  const toggleBillPaid = async (idx: number) => {
    const bills = [...allBills];
    bills[idx] = { ...bills[idx], paid: !bills[idx].paid };
    await upsertField({ bills });
  };

  const removeBill = async (idx: number) => {
    const bills = allBills.filter((_, i) => i !== idx);
    await upsertField({ bills });
    setBillModal({ open: false, editingIdx: null });
  };

  const openIncomeEditor = (idx: number | null) => {
    if (idx != null && allIncome[idx]) {
      const it = allIncome[idx];
      setIncomeForm({
        label: it.label || '',
        amount: it.amount != null ? String(it.amount) : '',
        expected_date: it.expected_date || '',
        recurring: it.recurring || '',
      });
    } else {
      setIncomeForm({ label: '', amount: '', expected_date: '', recurring: '' });
    }
    setIncomeModal({ open: true, editingIdx: idx });
  };

  const saveIncome = async () => {
    if (!incomeForm.label.trim() || !incomeForm.amount.trim()) {
      Alert.alert('Hold up', 'Need a label and amount.');
      return;
    }
    const newItem: any = {
      label: incomeForm.label.trim(),
      amount: parseFloat(incomeForm.amount) || 0,
    };
    if (incomeForm.expected_date) newItem.expected_date = incomeForm.expected_date;
    if (incomeForm.recurring) newItem.recurring = incomeForm.recurring;

    const income = [...allIncome];
    if (incomeModal.editingIdx != null) income[incomeModal.editingIdx] = newItem;
    else income.push(newItem);

    await upsertField({ income });
    setIncomeModal({ open: false, editingIdx: null });
  };

  const removeIncome = async (idx: number) => {
    const income = allIncome.filter((_, i) => i !== idx);
    await upsertField({ income });
    setIncomeModal({ open: false, editingIdx: null });
  };

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

  const saveDoom2 = async () => {};

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
                <Text style={[styles.quickValue, { color: Colors.pickleLime }]}>{formatMoney(effectiveIncome, currency)}</Text>
              </TouchableOpacity>
            </View>

            {/* Itemized Bills */}
            <Text style={styles.sectionLabel}>BILLS.</Text>
            <Text style={styles.sectionHint}>tap to edit. swipe past paid ones.</Text>
            {unpaidBills.map((b, i) => {
              const idx = allBills.indexOf(b);
              const days = b.due_date ? daysFromToday(b.due_date) : null;
              const overdue = days != null && days < 0;
              const dueSoon = days != null && days >= 0 && days <= 3;
              return (
                <CategoryCard
                  key={`bill-${idx}`}
                  title={`${b.label}  ·  ${formatMoney(b.amount, currency)}`}
                  subtitle={
                    b.due_date
                      ? overdue
                        ? `OVERDUE · ${Math.abs(days!)}d ago`
                        : days === 0
                          ? 'due today'
                          : `due in ${days}d${b.recurring ? ` · ${b.recurring}` : ''}`
                      : b.recurring || 'no date'
                  }
                  icon="receipt"
                  variant={overdue ? 'red' : dueSoon ? 'lilac' : 'dark'}
                  onPress={() => openBillEditor(idx)}
                  rightSlot={
                    <TouchableOpacity onPress={() => toggleBillPaid(idx)} style={styles.paidBtn}>
                      <Text style={styles.paidBtnText}>MARK PAID</Text>
                    </TouchableOpacity>
                  }
                />
              );
            })}
            <CategoryCard
              title="+ ADD BILL"
              subtitle={unpaidBills.length > 0 ? `${formatMoney(billsTotal, currency)} unpaid · ${unpaidBills.length} item${unpaidBills.length === 1 ? '' : 's'}` : 'rent, utilities, subscriptions...'}
              icon="add-circle"
              variant="red"
              onPress={() => openBillEditor(null)}
            />
            {paidBills.length > 0 && (
              <Text style={[styles.sectionHint, { marginTop: Spacing.xs }]}>
                ✓ {paidBills.length} paid this period (tap to undo)
              </Text>
            )}
            {paidBills.slice(0, 5).map((b) => {
              const idx = allBills.indexOf(b);
              return (
                <TouchableOpacity
                  key={`paid-${idx}`}
                  style={styles.paidRow}
                  onPress={() => toggleBillPaid(idx)}
                >
                  <Ionicons name="checkmark-circle" size={16} color={Colors.pickleLime} />
                  <Text style={styles.paidRowText}>{b.label} · {formatMoney(b.amount, currency)}</Text>
                </TouchableOpacity>
              );
            })}

            {/* Itemized Income */}
            <Text style={styles.sectionLabel}>INCOMING.</Text>
            <Text style={styles.sectionHint}>money on its way. invoices, paychecks, refunds.</Text>
            {allIncome.map((it, idx) => {
              const days = it.expected_date ? daysFromToday(it.expected_date) : null;
              return (
                <CategoryCard
                  key={`inc-${idx}`}
                  title={`${it.label}  ·  ${formatMoney(it.amount, currency)}`}
                  subtitle={
                    it.expected_date
                      ? days != null && days < 0
                        ? `expected ${Math.abs(days)}d ago`
                        : days === 0
                          ? 'arriving today'
                          : `in ${days}d${it.recurring ? ` · ${it.recurring}` : ''}`
                      : it.recurring || 'no date'
                  }
                  icon="trending-up"
                  variant="lime"
                  onPress={() => openIncomeEditor(idx)}
                />
              );
            })}
            <CategoryCard
              title="+ ADD INCOMING"
              subtitle={allIncome.length > 0 ? `${formatMoney(incomeTotal, currency)} expected` : 'invoice, salary, refund...'}
              icon="add-circle"
              variant="lime"
              onPress={() => openIncomeEditor(null)}
            />

            {/* Doom Spending */}
            <Text style={styles.sectionLabel}>DOOM SPENDING.</Text>
            <Text style={styles.sectionHint}>impulse buys & 3am amazon. this week only — auto-resets monday.</Text>
            {weeklyDoom.map((d: any, i: number) => (
              <CategoryCard
                key={i}
                title={d.label}
                subtitle={`${formatMoney(d.amount, currency)} · ${REGRET_LABELS[d.regret] || 'medium'} regret`}
                icon="flame"
                variant={d.regret >= 3 ? 'red' : 'dark'}
                rightSlot={
                  <TouchableOpacity onPress={() => removeDoom(allDoom.indexOf(d))}>
                    <Ionicons name="close-circle" size={22} color={Colors.steelBlueGrey} />
                  </TouchableOpacity>
                }
              />
            ))}
            <CategoryCard title="+ LOG A DOOM SPEND" subtitle={totalDoom > 0 ? `${formatMoney(totalDoom, currency)} this week` : 'no shame. just data.'} icon="add-circle" variant="red" onPress={() => setDoomModal(true)} />

            {/* Soft Saving */}
            <Text style={styles.sectionLabel}>SOFT SAVING.</Text>
            <Text style={styles.sectionHint}>small wins. spare change. this week only.</Text>
            {weeklySoft.map((s: any, i: number) => (
              <CategoryCard
                key={i}
                title={s.label}
                subtitle={formatMoney(s.amount, currency)}
                icon="leaf"
                variant="dark"
                rightSlot={
                  <TouchableOpacity onPress={() => removeSoft(allSoft.indexOf(s))}>
                    <Ionicons name="close-circle" size={22} color={Colors.steelBlueGrey} />
                  </TouchableOpacity>
                }
              />
            ))}
            <CategoryCard title="+ STASH A SMALL WIN" subtitle={totalSoft > 0 ? `${formatMoney(totalSoft, currency)} stashed this week` : 'every bit counts.'} icon="add-circle" variant="lime" onPress={() => setSoftModal(true)} />

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

      {/* Bill editor */}
      <Modal visible={billModal.open} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>{billModal.editingIdx != null ? 'EDIT BILL' : 'NEW BILL'}</Text>
              <Input label="LABEL" value={billForm.label} onChangeText={(t) => setBillForm({ ...billForm, label: t })} placeholder="rent, electricity, spotify..." autoFocus />
              <Input label="AMOUNT" value={billForm.amount} onChangeText={(t) => setBillForm({ ...billForm, amount: t })} keyboardType="decimal-pad" placeholder="0.00" />
              <DatePicker
                label="DUE DATE"
                value={billForm.due_date}
                onChange={(v) => setBillForm({ ...billForm, due_date: v })}
                placeholder="when's it due?"
                variant="red"
              />
              <ChipPicker
                label="RECURRING"
                options={['one-time', 'weekly', 'monthly', 'yearly']}
                value={billForm.recurring || 'one-time'}
                onChange={(v) => setBillForm({ ...billForm, recurring: v === 'one-time' ? '' : v })}
                variant="red"
                testIDPrefix="recur"
              />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setBillModal({ open: false, editingIdx: null })} variant="ghost" />
                <Button title="SAVE" onPress={saveBill} variant="primary" />
              </View>
              {billModal.editingIdx != null && (
                <Button title="DELETE" onPress={() => removeBill(billModal.editingIdx!)} variant="danger" style={{ marginTop: Spacing.md }} />
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Income editor */}
      <Modal visible={incomeModal.open} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>{incomeModal.editingIdx != null ? 'EDIT INCOMING' : 'NEW INCOMING'}</Text>
              <Input label="LABEL" value={incomeForm.label} onChangeText={(t) => setIncomeForm({ ...incomeForm, label: t })} placeholder="paycheck, invoice, refund..." autoFocus />
              <Input label="AMOUNT" value={incomeForm.amount} onChangeText={(t) => setIncomeForm({ ...incomeForm, amount: t })} keyboardType="decimal-pad" placeholder="0.00" />
              <DatePicker
                label="EXPECTED DATE"
                value={incomeForm.expected_date}
                onChange={(v) => setIncomeForm({ ...incomeForm, expected_date: v })}
                placeholder="when's it landing?"
                variant="lime"
              />
              <ChipPicker
                label="RECURRING"
                options={['one-time', 'weekly', 'monthly', 'yearly']}
                value={incomeForm.recurring || 'one-time'}
                onChange={(v) => setIncomeForm({ ...incomeForm, recurring: v === 'one-time' ? '' : v })}
                variant="lime"
                testIDPrefix="increc"
              />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setIncomeModal({ open: false, editingIdx: null })} variant="ghost" />
                <Button title="SAVE" onPress={saveIncome} variant="primary" />
              </View>
              {incomeModal.editingIdx != null && (
                <Button title="DELETE" onPress={() => removeIncome(incomeModal.editingIdx!)} variant="danger" style={{ marginTop: Spacing.md }} />
              )}
            </View>
          </ScrollView>
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
  paidBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.pickleLime,
  },
  paidBtnText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.inkBlack,
    fontWeight: '900',
    letterSpacing: 1,
  },
  paidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
  },
  paidRowText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSubtle,
    textDecorationLine: 'line-through',
  },
});
