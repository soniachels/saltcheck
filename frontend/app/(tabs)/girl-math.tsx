import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal, TouchableOpacity, Alert, RefreshControl,
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
import { generateCashflowPdf } from '../../src/utils/cashflowReport';

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

// Advance a date string by one recurrence period (for recurring income/bills).
function advanceDate(iso: string | undefined, period: string): string {
  const base = iso ? new Date(iso) : new Date();
  if (period === 'weekly') base.setDate(base.getDate() + 7);
  else if (period === 'biweekly') base.setDate(base.getDate() + 14);
  else base.setMonth(base.getMonth() + 1); // monthly default
  return base.toISOString().slice(0, 10);
}

// Group dated items into ISO weeks, newest week first, with per-week totals.
function groupByWeek(items: any[]): { week: string; total: number; items: any[] }[] {
  const buckets: Record<string, any[]> = {};
  for (const it of items) {
    const key = it.date ? isoWeekKey(new Date(it.date)) : 'undated';
    (buckets[key] = buckets[key] || []).push(it);
  }
  return Object.keys(buckets)
    .sort((a, b) => (a < b ? 1 : -1)) // newest week first; "undated" sorts last
    .map((week) => ({
      week,
      total: buckets[week].reduce((s, x) => s + (x.amount || 0), 0),
      items: buckets[week],
    }));
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
  const { currentUserId, nickname } = useAppStore();
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

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await loadEntry(); setRefreshing(false); };

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
  const receivedIncome = allIncome.filter((i: any) => i.received);
  const pendingIncome = allIncome.filter((i: any) => !i.received);
  const unpaidBills = allBills.filter((b) => !b.paid);
  const paidBills = allBills.filter((b) => b.paid);
  const billsTotal = unpaidBills.reduce((s, b) => s + (b.amount || 0), 0);
  const incomeTotal = pendingIncome.reduce((s, b) => s + (b.amount || 0), 0);

  // Sort helpers — bills by due date asc (overdue → soonest → later → no-date last)
  const sortBillsByDate = (arr: any[]) => arr.slice().sort((a, b) => {
    const ad = a.due_date || '9999-12-31';
    const bd = b.due_date || '9999-12-31';
    return ad.localeCompare(bd);
  });
  const sortIncomeByDate = (arr: any[]) => arr.slice().sort((a, b) => {
    const ad = a.expected_date || '9999-12-31';
    const bd = b.expected_date || '9999-12-31';
    return ad.localeCompare(bd);
  });
  // Doom by regret level desc (huge → none)
  const sortDoomByRegret = (arr: any[]) => arr.slice().sort((a, b) => (b.regret || 0) - (a.regret || 0));

  const sortedUnpaidBills = sortBillsByDate(unpaidBills);
  const sortedPendingIncome = sortIncomeByDate(pendingIncome);
  const sortedDoom = sortDoomByRegret(weeklyDoom);

  // See-all toggles
  const [showAllBills, setShowAllBills] = useState(false);
  const [showAllIncome, setShowAllIncome] = useState(false);
  const [showAllDoom, setShowAllDoom] = useState(false);
  const [showAllSoft, setShowAllSoft] = useState(false);
  const [showReceivedIncome, setShowReceivedIncome] = useState(false);
  // Which category's detail is expanded below the horizontal card carousel.
  const [activeCard, setActiveCard] = useState<'bills' | 'income' | 'doom' | 'soft'>('bills');
  // Doom/Soft history (all past weeks — main view only shows the current week).
  const [historyModal, setHistoryModal] = useState<{ open: boolean; kind: 'doom' | 'soft' }>({ open: false, kind: 'doom' });
  // Cash-flow PDF report
  const monthStart = `${today.slice(0, 8)}01`;
  const [reportModal, setReportModal] = useState(false);
  const [reportStart, setReportStart] = useState(monthStart);
  const [reportEnd, setReportEnd] = useState(today);
  const [reportBusy, setReportBusy] = useState(false);

  const handleGenerateReport = async () => {
    if (reportStart > reportEnd) {
      Alert.alert('Hold up', 'Start date is after the end date.');
      return;
    }
    setReportBusy(true);
    try {
      await generateCashflowPdf({
        entry,
        startDate: reportStart,
        endDate: reportEnd,
        fmt: (n: number) => formatMoney(n, currency),
        userName: nickname || undefined,
      });
      setReportModal(false);
    } catch (e: any) {
      Alert.alert('Report failed', e?.message || 'Could not build the PDF.');
    } finally {
      setReportBusy(false);
    }
  };

  const DEFAULT_VISIBLE = 5;
  const visibleBills = showAllBills ? sortedUnpaidBills : sortedUnpaidBills.slice(0, DEFAULT_VISIBLE);
  const visibleIncome = showAllIncome ? sortedPendingIncome : sortedPendingIncome.slice(0, DEFAULT_VISIBLE);
  const visibleDoom = showAllDoom ? sortedDoom : sortedDoom.slice(0, DEFAULT_VISIBLE);
  const visibleSoft = showAllSoft ? weeklySoft : weeklySoft.slice(0, DEFAULT_VISIBLE);

  // ---- Active running balance ----
  // Starts at the user's keyed-in starting balance; marking a bill PAID deducts
  // it, marking income RECEIVED tops it up. Derived (not a mutated number) so
  // toggling paid/received on and off always stays correct.
  const startingBalance = entry?.cash_available || 0;
  const paidBillsTotal = paidBills.reduce((s, b) => s + (b.amount || 0), 0);
  const receivedIncomeTotal = receivedIncome.reduce((s, i) => s + (i.amount || 0), 0);
  const activeBalance = startingBalance - paidBillsTotal + receivedIncomeTotal;

  // Projected balance once everything still-outstanding settles.
  const projectedBalance = activeBalance - billsTotal + incomeTotal;

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

  const toggleIncomeReceived = async (idx: number) => {
    const income = [...allIncome];
    const item = income[idx];
    const nowReceived = !item.received;
    income[idx] = { ...item, received: nowReceived };
    // Recurring income: when first marked received, spin up the next occurrence
    // (unreceived, dated one period later). _spawned guards against duplicates.
    if (nowReceived && item.recurring && !item._spawned) {
      income[idx]._spawned = true;
      income.push({
        label: item.label,
        amount: item.amount,
        recurring: item.recurring,
        expected_date: advanceDate(item.expected_date, item.recurring),
        received: false,
      });
    }
    await upsertField({ income });
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brightRed} colors={[Colors.brightRed]} />}
      >
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>* GIRL MATH</Text>
          <Text style={styles.heroTitle}>the floor is the floor.</Text>
          <Text style={styles.heroSub}>pay a bill, it drops. money in, it climbs.</Text>
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
            {/* ACTIVE BALANCE — hero number */}
            <View style={styles.floorCard}>
              <Text style={styles.floorLabel}>ACTIVE BALANCE</Text>
              <Text style={[styles.floorAmount, activeBalance < 0 && styles.floorAmountNegative]}>
                {formatMoney(activeBalance, currency)}
              </Text>
              <Text style={styles.floorSub}>
                {formatMoney(startingBalance, currency)} start
                {paidBillsTotal > 0 ? ` − ${formatMoney(paidBillsTotal, currency)} paid` : ''}
                {receivedIncomeTotal > 0 ? ` + ${formatMoney(receivedIncomeTotal, currency)} in` : ''}
              </Text>
              {(billsTotal > 0 || incomeTotal > 0) && (
                <View style={styles.incomeBadge}>
                  <Ionicons name="git-compare" size={14} color={Colors.pickleLime} />
                  <Text style={styles.incomeText}>
                    projected {formatMoney(projectedBalance, currency)} after {formatMoney(billsTotal, currency)} bills{incomeTotal > 0 ? ` / +${formatMoney(incomeTotal, currency)} due` : ''}
                  </Text>
                </View>
              )}
            </View>

            {/* Quick stats — starting balance editable; bills/income left are derived */}
            <View style={styles.quickRow}>
              <TouchableOpacity style={styles.quickTile} onPress={() => { setEditField('cash_available'); setEditValue(entry?.cash_available?.toString() || ''); }}>
                <Text style={styles.quickLabel}>STARTING</Text>
                <Text style={styles.quickValue}>{formatMoney(startingBalance, currency)}</Text>
              </TouchableOpacity>
              <View style={styles.quickTile}>
                <Text style={styles.quickLabel}>BILLS LEFT</Text>
                <Text style={[styles.quickValue, { color: Colors.brightRed }]}>{formatMoney(billsTotal, currency)}</Text>
              </View>
              <View style={styles.quickTile}>
                <Text style={styles.quickLabel}>INCOMING</Text>
                <Text style={[styles.quickValue, { color: Colors.pickleLime }]}>{formatMoney(incomeTotal, currency)}</Text>
              </View>
            </View>

            {/* Cash-flow PDF report */}
            <TouchableOpacity style={styles.reportBtn} onPress={() => setReportModal(true)}>
              <Ionicons name="document-text-outline" size={16} color={Colors.text} />
              <Text style={styles.reportBtnText}>CASH FLOW REPORT (PDF)</Text>
            </TouchableOpacity>

            {/* Category carousel — square cards, horizontal scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardScroll}
              style={{ marginBottom: Spacing.md }}
            >
              {([
                { key: 'bills', label: 'BILLS', value: billsTotal, count: unpaidBills.length, color: Colors.brightRed, sub: `${unpaidBills.length} unpaid` },
                { key: 'income', label: 'INCOMING', value: incomeTotal, count: pendingIncome.length, color: Colors.pickleLime, sub: `${pendingIncome.length} pending` },
                { key: 'doom', label: 'DOOM', value: totalDoom, count: weeklyDoom.length, color: Colors.brightRed, sub: 'this week' },
                { key: 'soft', label: 'SOFT SAVING', value: totalSoft, count: weeklySoft.length, color: Colors.pickleLime, sub: 'this week' },
              ] as const).map((c) => {
                const active = activeCard === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.squareCard, active && styles.squareCardActive]}
                    activeOpacity={0.85}
                    onPress={() => setActiveCard(c.key)}
                  >
                    <Text style={[styles.squareCardLabel, active && { color: c.color }]}>{c.label}</Text>
                    <Text style={styles.squareCardValue}>{formatMoney(c.value, currency)}</Text>
                    <Text style={styles.squareCardSub}>{c.sub}</Text>
                    {active && <View style={[styles.squareCardBar, { backgroundColor: c.color }]} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Itemized Bills */}
            {activeCard === 'bills' && (<>
            <Text style={styles.sectionLabel}>BILLS.</Text>
            <Text style={styles.sectionHint}>sorted by due date. overdue at the top.</Text>
            {visibleBills.map((b: any) => {
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
            {sortedUnpaidBills.length > DEFAULT_VISIBLE && (
              <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowAllBills((v) => !v)}>
                <Text style={styles.seeAllText}>
                  {showAllBills ? `SHOW LESS` : `SEE ALL · ${sortedUnpaidBills.length}`}
                </Text>
                <Ionicons name={showAllBills ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.text} />
              </TouchableOpacity>
            )}
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

            </>)}

            {/* Itemized Income */}
            {activeCard === 'income' && (<>
            <Text style={styles.sectionLabel}>INCOMING.</Text>
            <Text style={styles.sectionHint}>sorted by arrival date. mark received when it lands.</Text>
            {visibleIncome.map((it: any) => {
              const idx = allIncome.indexOf(it);
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
                  rightSlot={
                    <TouchableOpacity onPress={() => toggleIncomeReceived(idx)} style={styles.receivedBtn}>
                      <Text style={styles.receivedBtnText}>RECEIVED</Text>
                    </TouchableOpacity>
                  }
                />
              );
            })}
            {sortedPendingIncome.length > DEFAULT_VISIBLE && (
              <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowAllIncome((v) => !v)}>
                <Text style={styles.seeAllText}>
                  {showAllIncome ? `SHOW LESS` : `SEE ALL · ${sortedPendingIncome.length}`}
                </Text>
                <Ionicons name={showAllIncome ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.text} />
              </TouchableOpacity>
            )}
            <CategoryCard
              title="+ ADD INCOMING"
              subtitle={pendingIncome.length > 0 ? `${formatMoney(incomeTotal, currency)} expected` : 'invoice, salary, refund...'}
              icon="add-circle"
              variant="lime"
              onPress={() => openIncomeEditor(null)}
            />
            {receivedIncome.length > 0 && (
              <TouchableOpacity onPress={() => setShowReceivedIncome((v) => !v)} style={{ marginTop: Spacing.xs }}>
                <Text style={[styles.sectionHint, { color: Colors.pickleLime }]}>
                  {showReceivedIncome ? '▾' : '▸'} ✓ {receivedIncome.length} received (tap)
                </Text>
              </TouchableOpacity>
            )}
            {showReceivedIncome && receivedIncome.map((it: any) => {
              const idx = allIncome.indexOf(it);
              return (
                <TouchableOpacity
                  key={`recv-${idx}`}
                  style={styles.paidRow}
                  onPress={() => toggleIncomeReceived(idx)}
                >
                  <Ionicons name="checkmark-circle" size={16} color={Colors.pickleLime} />
                  <Text style={styles.paidRowText}>{it.label} · {formatMoney(it.amount, currency)}</Text>
                </TouchableOpacity>
              );
            })}

            </>)}

            {/* Doom Spending */}
            {activeCard === 'doom' && (<>
            <Text style={styles.sectionLabel}>DOOM SPENDING.</Text>
            <Text style={styles.sectionHint}>sorted by regret. this week only — auto-resets monday.</Text>
            {visibleDoom.map((d: any, i: number) => (
              <CategoryCard
                key={i}
                title={d.label}
                subtitle={`${formatMoney(d.amount, currency)} · ${REGRET_LABELS[d.regret] || 'medium'} regret`}
                icon="flame"
                variant={d.regret >= 3 ? 'red' : d.regret >= 2 ? 'lilac' : 'dark'}
                rightSlot={
                  <TouchableOpacity onPress={() => removeDoom(allDoom.indexOf(d))}>
                    <Ionicons name="close-circle" size={22} color={Colors.steelBlueGrey} />
                  </TouchableOpacity>
                }
              />
            ))}
            {sortedDoom.length > DEFAULT_VISIBLE && (
              <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowAllDoom((v) => !v)}>
                <Text style={styles.seeAllText}>
                  {showAllDoom ? `SHOW LESS` : `SEE ALL · ${sortedDoom.length}`}
                </Text>
                <Ionicons name={showAllDoom ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.text} />
              </TouchableOpacity>
            )}
            <CategoryCard title="+ LOG A DOOM SPEND" subtitle={totalDoom > 0 ? `${formatMoney(totalDoom, currency)} this week` : 'no shame. just data.'} icon="add-circle" variant="red" onPress={() => setDoomModal(true)} />
            {allDoom.length > weeklyDoom.length && (
              <TouchableOpacity style={styles.historyLink} onPress={() => setHistoryModal({ open: true, kind: 'doom' })}>
                <Ionicons name="time-outline" size={14} color={Colors.textSubtle} />
                <Text style={styles.historyLinkText}>VIEW HISTORY · {allDoom.length} total</Text>
              </TouchableOpacity>
            )}

            </>)}

            {/* Soft Saving */}
            {activeCard === 'soft' && (<>
            <Text style={styles.sectionLabel}>SOFT SAVING.</Text>
            <Text style={styles.sectionHint}>small wins. spare change. this week only.</Text>
            {visibleSoft.map((s: any, i: number) => (
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
            {weeklySoft.length > DEFAULT_VISIBLE && (
              <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowAllSoft((v) => !v)}>
                <Text style={styles.seeAllText}>
                  {showAllSoft ? `SHOW LESS` : `SEE ALL · ${weeklySoft.length}`}
                </Text>
                <Ionicons name={showAllSoft ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.text} />
              </TouchableOpacity>
            )}
            <CategoryCard title="+ STASH A SMALL WIN" subtitle={totalSoft > 0 ? `${formatMoney(totalSoft, currency)} stashed this week` : 'every bit counts.'} icon="add-circle" variant="lime" onPress={() => setSoftModal(true)} />
            {allSoft.length > weeklySoft.length && (
              <TouchableOpacity style={styles.historyLink} onPress={() => setHistoryModal({ open: true, kind: 'soft' })}>
                <Ionicons name="time-outline" size={14} color={Colors.textSubtle} />
                <Text style={styles.historyLinkText}>VIEW HISTORY · {allSoft.length} total</Text>
              </TouchableOpacity>
            )}
            </>)}

            {/* PEPPER analysis */}
            <PepperBubble label="* PEPPER" variant={activeBalance < 0 ? 'red' : 'lime'} style={{ marginTop: Spacing.lg }}>
              {activeBalance < 0
                ? `Balance is under by ${formatMoney(Math.abs(activeBalance), currency)}. Pause spending. Chase one income.`
                : projectedBalance < 0
                ? `You're fine now, but after the unpaid bills you land at ${formatMoney(projectedBalance, currency)}. Don't get comfy.`
                : activeBalance < 100
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

      {/* Doom/Soft history — past weeks */}
      <Modal visible={historyModal.open} animationType="slide" transparent onRequestClose={() => setHistoryModal({ ...historyModal, open: false })}>
        <View style={styles.modalOverlay}>
          <View style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.editorTitle}>{historyModal.kind === 'doom' ? 'DOOM HISTORY' : 'SOFT SAVING HISTORY'}</Text>
              <TouchableOpacity onPress={() => setHistoryModal({ ...historyModal, open: false })}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionHint}>resets every monday — but the receipts stay here.</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {groupByWeek(historyModal.kind === 'doom' ? allDoom : allSoft).map((g) => (
                <View key={g.week} style={styles.weekGroup}>
                  <View style={styles.weekHeader}>
                    <Text style={styles.weekLabel}>{g.week === thisWeek ? 'THIS WEEK' : g.week === 'undated' ? 'UNDATED' : g.week}</Text>
                    <Text style={[styles.weekTotal, { color: historyModal.kind === 'doom' ? Colors.brightRed : Colors.pickleLime }]}>{formatMoney(g.total, currency)}</Text>
                  </View>
                  {g.items.map((it: any, i: number) => (
                    <View key={i} style={styles.weekItem}>
                      <Text style={styles.weekItemLabel}>{it.label}</Text>
                      <Text style={styles.weekItemAmt}>
                        {formatMoney(it.amount, currency)}
                        {historyModal.kind === 'doom' && it.regret != null ? ` · ${REGRET_LABELS[it.regret] || ''}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
            <Button title="DONE" onPress={() => setHistoryModal({ ...historyModal, open: false })} variant="primary" style={{ marginTop: Spacing.md }} />
          </View>
        </View>
      </Modal>

      {/* Cash-flow report — pick a date range, export PDF */}
      <Modal visible={reportModal} animationType="slide" transparent onRequestClose={() => setReportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>CASH FLOW REPORT</Text>
              <Text style={styles.sectionHint}>pick a range. we'll build a PDF you can save or share.</Text>
              <DatePicker label="FROM" value={reportStart} onChange={setReportStart} variant="lilac" />
              <DatePicker label="TO" value={reportEnd} onChange={setReportEnd} variant="lilac" />
              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setReportModal(false)} variant="ghost" />
                <Button title={reportBusy ? 'BUILDING…' : 'EXPORT PDF'} onPress={handleGenerateReport} variant="primary" loading={reportBusy} />
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
  // Horizontal category carousel
  cardScroll: { gap: Spacing.sm, paddingVertical: Spacing.xs, paddingRight: Spacing.md },
  squareCard: {
    width: 130, height: 130,
    backgroundColor: Colors.charcoalRaised,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    justifyContent: 'space-between',
  },
  squareCardActive: { borderColor: Colors.text, backgroundColor: Colors.charcoalRaised, transform: [{ scale: 1.02 }] },
  squareCardLabel: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontWeight: '800', letterSpacing: 1 },
  squareCardValue: { fontSize: Typography.fontSize.xl, color: Colors.text, fontWeight: '900' },
  squareCardSub: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle },
  squareCardBar: { height: 3, borderRadius: 2, marginTop: 2 },
  // History
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.sm, marginBottom: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.charcoalRaised },
  reportBtnText: { fontSize: Typography.fontSize.xs, color: Colors.text, fontWeight: '800', letterSpacing: 1 },
  historyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, justifyContent: 'center' },
  historyLinkText: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontWeight: '700', letterSpacing: 1 },
  historyCard: { marginTop: 'auto', backgroundColor: Colors.charcoalRaised, borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  weekGroup: { marginTop: Spacing.md },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 4, marginBottom: 6 },
  weekLabel: { fontSize: Typography.fontSize.xs, color: Colors.text, fontWeight: '800', letterSpacing: 1 },
  weekTotal: { fontSize: Typography.fontSize.sm, fontWeight: '800' },
  weekItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  weekItemLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSubtle },
  weekItemAmt: { fontSize: Typography.fontSize.sm, color: Colors.text, fontWeight: '600' },
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
  receivedBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.pickleLime,
  },
  receivedBtnText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.inkBlack,
    fontWeight: '900',
    letterSpacing: 1,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  seeAllText: {
    color: Colors.text,
    fontSize: Typography.fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
