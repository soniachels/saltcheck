import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal, TouchableOpacity, Alert, RefreshControl, Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { CategoryCard } from '../../src/components/CategoryCard';
import { BrandLogo } from '../../src/components/BrandLogo';

// Hero photo — drop your own image at this path (overwrite the file) to swap it.
const HERO_IMG = require('../../assets/girlmath-hero.jpg');
import { PepperBubble } from '../../src/components/PepperBubble';
import { ChipPicker } from '../../src/components/ChipPicker';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { DatePicker } from '../../src/components/DatePicker';
import apiClient from '../../src/services/api';
import { useAppStore } from '../../src/store/appStore';
import { detectCurrency, formatMoney } from '../../src/utils/locale';
import { generateCashflowPdf } from '../../src/utils/cashflowReport';
import { scheduleBillReminders } from '../../src/utils/notifications';

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
// Handles "weekly"/"biweekly"/"monthly" and free-form "every N months/weeks"
// (e.g. "every 5 months") so multi-period cycles land on the right date.
function advanceDate(iso: string | undefined, period: string): string {
  const base = iso ? new Date(iso) : new Date();
  const p = (period || '').toLowerCase();
  const everyWeeks = p.match(/(\d+)\s*week/);
  const everyMonths = p.match(/(\d+)\s*month/);
  if (p === 'weekly') base.setDate(base.getDate() + 7);
  else if (p === 'biweekly') base.setDate(base.getDate() + 14);
  else if (everyWeeks) base.setDate(base.getDate() + 7 * parseInt(everyWeeks[1], 10));
  else if (everyMonths) base.setMonth(base.getMonth() + parseInt(everyMonths[1], 10));
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
  const router = useRouter();
  const openPepper = () => router.push('/pepper-checkin');
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

  // Measured heights so the rounded photo card ends just below the balance card.
  const [titleH, setTitleH] = useState(360);
  const [cardH, setCardH] = useState(300);
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

  // Append-only transaction log: every money movement (bill paid, income
  // received, doom, soft) is recorded with a real timestamp so the cash-flow
  // report is a true time-series. The returned id is stashed on the item as
  // `_txn` so undo/remove can delete the matching transaction.
  const recordTxn = async (kind: string, label: string, amount: number, regret?: number): Promise<string | undefined> => {
    if (!amount || amount <= 0) return undefined; // nothing to log for unknown amounts
    try {
      const r = await apiClient.post('/transactions', { kind, label: label || '—', amount, currency, regret });
      return r.data?.id;
    } catch (e) { return undefined; }
  };
  const deleteTxn = async (txnId?: string) => {
    if (!txnId) return;
    try { await apiClient.delete(`/transactions/${txnId}`); } catch (e) {}
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

  // Local "due tomorrow" reminders — reschedule only when the bills actually
  // change (label/amount/due/paid), not on every render.
  const billsSig = JSON.stringify(allBills.map((b) => [b.label, b.amount, b.due_date, b.paid]));
  useEffect(() => {
    scheduleBillReminders(allBills, currency);
  }, [billsSig, currency]);
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
      // Pull the real transaction log for the range so the report is an actual
      // time-series of when money moved, not a snapshot of scheduled dates.
      let transactions: any[] = [];
      try {
        const r = await apiClient.get(`/transactions/${currentUserId}?start=${reportStart}&end=${reportEnd}`);
        transactions = r.data || [];
      } catch (e) {}
      await generateCashflowPdf({
        entry,
        transactions,
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

  // ---- Dynamic PEPPER hero copy (reacts to the user's money state) ----
  const hasOverdue = unpaidBills.some((b) => b.due_date && b.due_date < today);
  const allBillsPaid = allBills.length > 0 && unpaidBills.length === 0;
  const pepperMood =
    hasOverdue ? 'SIDE-EYEING YOU' :
    activeBalance < 0 ? 'WORRIED' :
    allBillsPaid ? 'IMPRESSED' :
    activeBalance >= 1000 ? 'PROUD' :
    'BORED';
  const heroHeadline =
    activeBalance < 0 ? 'in the red, bestie.' :
    hasOverdue ? 'pay your bills, bestie.' :
    activeBalance < 100 ? 'broke, again?' :
    activeBalance >= 1000 ? 'look at you, loaded.' :
    "we're managing.";

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
    const bill = bills[idx];
    const nowPaid = !bill.paid;
    let txnId = bill._txn;
    if (nowPaid) {
      txnId = await recordTxn('bill_paid', bill.label, bill.amount);
    } else {
      await deleteTxn(bill._txn);
      txnId = undefined;
    }
    bills[idx] = { ...bill, paid: nowPaid, _txn: txnId };
    // Recurring bill: when first marked paid, spin up the next occurrence
    // (unpaid, dated one period later) so it reappears next cycle — mirrors how
    // recurring income works. _spawned guards against duplicates if re-toggled.
    if (nowPaid && bill.recurring && !bill._spawned) {
      bills[idx]._spawned = true;
      bills.push({
        label: bill.label,
        amount: bill.amount,
        recurring: bill.recurring,
        due_date: advanceDate(bill.due_date, bill.recurring),
        paid: false,
      });
    }
    await upsertField({ bills });
  };

  const removeBill = async (idx: number) => {
    await deleteTxn(allBills[idx]?._txn);
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
    await deleteTxn(allIncome[idx]?._txn);
    const income = allIncome.filter((_, i) => i !== idx);
    await upsertField({ income });
    setIncomeModal({ open: false, editingIdx: null });
  };

  const toggleIncomeReceived = async (idx: number) => {
    const income = [...allIncome];
    const item = income[idx];
    const nowReceived = !item.received;
    let txnId = item._txn;
    if (nowReceived) {
      txnId = await recordTxn('income_received', item.label, item.amount);
    } else {
      await deleteTxn(item._txn);
      txnId = undefined;
    }
    income[idx] = { ...item, received: nowReceived, _txn: txnId };
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
    const amount = parseFloat(doomForm.amount) || 0;
    const txnId = await recordTxn('doom_spend', doomForm.label, amount, doomForm.regret);
    const ds = [...(entry?.doom_spends || []), {
      label: doomForm.label,
      amount,
      regret: doomForm.regret,
      date: today,
      _txn: txnId,
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
    const amount = parseFloat(softForm.amount) || 0;
    const txnId = await recordTxn('soft_saving', softForm.label, amount);
    const ss = [...(entry?.soft_savings || []), {
      label: softForm.label,
      amount,
      date: today,
      _txn: txnId,
    }];
    await upsertField({ soft_savings: ss });
    setSoftModal(false);
    setSoftForm({ label: '', amount: '' });
  };

  const removeDoom = async (i: number) => {
    await deleteTxn((entry?.doom_spends || [])[i]?._txn);
    const ds = (entry?.doom_spends || []).filter((_: any, idx: number) => idx !== i);
    await upsertField({ doom_spends: ds });
  };

  const removeSoft = async (i: number) => {
    await deleteTxn((entry?.soft_savings || [])[i]?._txn);
    const ss = (entry?.soft_savings || []).filter((_: any, idx: number) => idx !== i);
    await upsertField({ soft_savings: ss });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brightRed} colors={[Colors.brightRed]} />}
      >
        {/* Rounded-bottom photo card behind the title + balance card. Frame with
            topPhotoImg.height (zoom) + marginTop (vertical position); the card's
            height ends just below the balance card so the rounded corners show. */}
        <View style={[styles.topPhotoWrap, { height: titleH + (showIntake ? 24 : cardH + 36) }]}>
          <Image source={HERO_IMG} style={styles.topPhotoImg} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(13,13,13,0.28)', 'rgba(13,13,13,0)', 'rgba(13,13,13,0)', 'rgba(13,13,13,0.35)']}
            locations={[0, 0.16, 0.72, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>
        <View style={styles.heroTitleWrap} onLayout={(e) => setTitleH(e.nativeEvent.layout.height)}>
          <Text style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit>GIRL MATH</Text>
          <Text style={styles.heroPepper}>* PEPPER IS {pepperMood}</Text>
          <Text style={styles.heroHeadline}>{heroHeadline}</Text>
          <Text style={styles.heroSub}>KNOW UR MATH, BESTIE</Text>
        </View>

        <View style={styles.body}>
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
            {/* ACTIVE BALANCE — frosted glass card over the photo */}
            <View style={styles.balanceShadow} onLayout={(e) => setCardH(e.nativeEvent.layout.height)}>
            <View style={styles.balanceCard}>
              <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />
              {/* tinted lime gradient: pale chartreuse → olive (translucent so the
                  hero photo bleeds through the frosted glass) */}
              <LinearGradient
                colors={['rgba(210,224,118,0.60)', 'rgba(172,194,68,0.58)', 'rgba(138,158,50,0.66)']}
                locations={[0, 0.55, 1]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {/* white sheen across the top for the glossy frosted look */}
              <LinearGradient
                colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.0)']}
                locations={[0, 0.5]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.balanceInner}>
              {/* pill row: active-balance tab + cash-flow report action */}
              <View style={styles.pillRow}>
                <View style={[styles.pill, styles.pillActive]}>
                  <Ionicons name="scale-outline" size={14} color={Colors.inkBlack} />
                  <Text style={styles.pillActiveText}>ACTIVE BALANCE</Text>
                </View>
                <TouchableOpacity style={styles.pill} onPress={() => setReportModal(true)} activeOpacity={0.8}>
                  <Ionicons name="document-text-outline" size={14} color={Colors.inkBlack} />
                  <Text style={styles.pillText}>CASH FLOW REPORT{'{PDF}'}</Text>
                </TouchableOpacity>
              </View>

              {/* the big number */}
              <Text
                style={[styles.balanceAmount, activeBalance < 0 && { color: Colors.berryPill }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatMoney(activeBalance, currency)}
              </Text>
              <TouchableOpacity
                onPress={() => { setEditField('cash_available'); setEditValue(entry?.cash_available?.toString() || ''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.balanceSub}>
                  {formatMoney(startingBalance, currency)} START
                  {paidBillsTotal > 0 ? ` − ${formatMoney(paidBillsTotal, currency)} PAID` : ''}
                  {receivedIncomeTotal > 0 ? ` + ${formatMoney(receivedIncomeTotal, currency)} IN` : ''}
                </Text>
              </TouchableOpacity>

              {/* nested projected card — brighter chartreuse gradient + sheen */}
              <View style={styles.projectedCard}>
                <LinearGradient
                  colors={['rgba(212,236,62,0.97)', 'rgba(176,199,46,0.97)']}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
                  locations={[0, 0.55]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.projectedIcon}>
                  <Ionicons name="arrow-up" size={28} color={Colors.inkBlack} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.projectedLabel}>PROJECTED AFTER BILLS + INCOMING</Text>
                  <Text
                    style={[styles.projectedAmount, projectedBalance < 0 && { color: Colors.berryPill }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatMoney(projectedBalance, currency)}
                  </Text>
                </View>
              </View>
              </View>
            </View>
            </View>

            {/* Category carousel — square cards, horizontal scroll. marginTop =
                the black gap between the rounded photo card and these cards. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardScroll}
              style={{ marginTop: 50, marginBottom: Spacing.md, marginHorizontal: -Layout.screenPadding }}
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
                    style={[styles.catCard, active && styles.catCardActiveGlow]}
                    activeOpacity={0.85}
                    onPress={() => setActiveCard(c.key)}
                  >
                    {active ? (
                      <View style={[StyleSheet.absoluteFill, styles.catCardActiveFill]} />
                    ) : (
                      <>
                        <LinearGradient
                          colors={['rgba(214,228,150,0.96)', 'rgba(176,206,74,0.96)']}
                          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                        <LinearGradient
                          colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                          locations={[0, 0.5]}
                          style={StyleSheet.absoluteFill}
                          pointerEvents="none"
                        />
                      </>
                    )}
                    <View style={styles.catCardTop}>
                      <Text style={[styles.catCardLabel, { color: active ? Colors.limeElectric : Colors.inkBlack }]}>{c.label}</Text>
                      <View style={[styles.catCount, { backgroundColor: active ? Colors.limeElectric : 'rgba(13,13,13,0.18)' }]}>
                        <Text style={[styles.catCountText, { color: active ? Colors.inkBlack : Colors.inkBlack }]}>{c.count}</Text>
                      </View>
                    </View>
                    <Text style={[styles.catCardValue, { color: active ? Colors.saltBone : Colors.inkBlack }]}>{formatMoney(c.value, currency)}</Text>
                    <Text style={[styles.catCardSub, { color: active ? Colors.textSubtle : 'rgba(13,13,13,0.6)' }]}>{c.sub.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Itemized Bills — branded rows inside a lime panel */}
            {activeCard === 'bills' && (
            <LinearGradient
              colors={['#D7E388', '#C4D85E']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={styles.limePanel}
            >
            <Text style={styles.panelTitle}>BILLS.</Text>
            <Text style={styles.panelHint}>SORTED BY DUE DATE. OVERDUE AT THE TOP</Text>
            {visibleBills.map((b: any) => {
              const idx = allBills.indexOf(b);
              const days = b.due_date ? daysFromToday(b.due_date) : null;
              const overdue = days != null && days < 0;
              const due = b.due_date
                ? overdue ? `OVERDUE · ${Math.abs(days!)}d ago`
                  : days === 0 ? 'due today'
                  : `due in ${days}d${b.recurring ? ` ${b.recurring}` : ''}`
                : (b.recurring || 'no date');
              return (
                <TouchableOpacity key={`bill-${idx}`} style={styles.billRow} activeOpacity={0.85} onPress={() => openBillEditor(idx)}>
                  <BrandLogo label={b.label} size={48} />
                  <View style={styles.billMid}>
                    <Text style={styles.billName} numberOfLines={1}>{b.label}</Text>
                    <Text style={styles.billAmtRed}>· {formatMoney(b.amount, currency)}</Text>
                    <Text style={[styles.billDue, overdue && { color: Colors.berryPill }]} numberOfLines={1}>{due}</Text>
                  </View>
                  <View style={styles.billRight}>
                    <Text style={styles.billAmtBig}>{formatMoney(b.amount, currency)}</Text>
                    <TouchableOpacity onPress={() => toggleBillPaid(idx)} style={styles.paidPill}>
                      <Text style={styles.paidPillText}>PAID?</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
            {sortedUnpaidBills.length > DEFAULT_VISIBLE && (
              <TouchableOpacity style={styles.panelSeeAll} onPress={() => setShowAllBills((v) => !v)}>
                <Text style={styles.panelSeeAllText}>
                  {showAllBills ? `SHOW LESS` : `SEE ALL · ${sortedUnpaidBills.length}`}
                </Text>
                <Ionicons name={showAllBills ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.inkBlack} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.addBillBtn} onPress={() => openBillEditor(null)} activeOpacity={0.85}>
              <Ionicons name="add" size={20} color={Colors.inkBlack} />
              <Text style={styles.addBillText}>ADD BILL</Text>
            </TouchableOpacity>
            {paidBills.length > 0 && (
              <Text style={styles.paidHint}>✓ {paidBills.length} PAID THIS PERIOD (TAP TO UNDO)</Text>
            )}
            {paidBills.slice(0, 5).map((b) => {
              const idx = allBills.indexOf(b);
              return (
                <TouchableOpacity key={`paid-${idx}`} style={styles.paidRow} onPress={() => toggleBillPaid(idx)}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.limeDeep} />
                  <Text style={styles.paidRowText}>{b.label} · {formatMoney(b.amount, currency)}</Text>
                </TouchableOpacity>
              );
            })}
            </LinearGradient>
            )}

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
                <Ionicons name={showAllIncome ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.inkBlack} />
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
                <Ionicons name={showAllDoom ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.inkBlack} />
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
                <Ionicons name={showAllSoft ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.inkBlack} />
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

            {/* ASK PEPPER — aurora frosted entry card */}
            <View style={styles.askGlow}>
              <View style={styles.askCard}>
                <LinearGradient
                  colors={['#E9E84C', '#F0B23C', '#E87E9C']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={['rgba(240,170,70,0.55)', 'rgba(255,255,255,0)', 'rgba(232,120,156,0.5)']}
                  start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <LinearGradient
                  colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
                  locations={[0, 0.5]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.askInner}>
                  <View style={styles.askTop}>
                    <Text style={styles.askTitle}>ASK PEPPER</Text>
                    <TouchableOpacity style={styles.askExpand} onPress={openPepper} accessibilityLabel="Open PEPPER">
                      <Ionicons name="expand-outline" size={20} color={Colors.inkBlack} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.askPill} onPress={() => setSoftModal(true)} activeOpacity={0.85}>
                    <Text style={styles.askPillText}>TRY ONE SOFT SAVE TODAY</Text>
                    <View style={styles.askPlus}><Ionicons name="add" size={16} color={Colors.inkBlack} /></View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.askDump} onPress={openPepper} activeOpacity={0.85}>
                    <View style={styles.askMic}><Ionicons name="mic" size={18} color={Colors.saltBone} /></View>
                    <Text style={styles.askDumpText}>DUMP A BILL OR RANT</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        )}
        </View>

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
  content: { paddingBottom: 120 },
  body: { paddingHorizontal: Layout.screenPadding },
  // Photo backs the top section down to the bills panel (absolute, bleeds under
  // the status bar). The title + frosted cards flow over it.
  // Rounded-bottom photo card. Height ends just below the balance card so the
  // rounded corners peek out; matches the bills panel's top radius (HERO_RADIUS).
  topPhotoWrap: {
    position: 'absolute', top: 0, left: 0, right: 0,
    overflow: 'hidden', backgroundColor: '#9c9a98',
    borderBottomLeftRadius: 34, borderBottomRightRadius: 34,
  },
  topPhotoImg: { width: '100%', height: 1180, marginTop: -360 }, // marginTop = vertical framing
  heroTitleWrap: { paddingHorizontal: Layout.screenPadding, paddingTop: 215, paddingBottom: 14 },
  heroTitle: {
    fontFamily: Typography.fontFamily.display, // Horizon (stand-in: ArchivoBlack)
    fontSize: 64, color: Colors.limeBright, letterSpacing: 1,
    textShadowColor: 'rgba(201,242,63,0.45)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18,
  },
  heroPepper: {
    fontFamily: Typography.fontFamily.mono, // IBM Plex Mono
    fontSize: 13, color: Colors.limeElectric, letterSpacing: 3, marginTop: 10,
  },
  heroHeadline: {
    fontFamily: Typography.fontFamily.headline, // Anton
    fontSize: 40, color: Colors.saltBone, marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  heroSub: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.sm, color: Colors.saltBone, letterSpacing: 3, marginTop: 6,
  },
  // ---- Frosted-glass lime balance card ----
  balanceShadow: {
    borderRadius: 30, marginBottom: Spacing.md,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 12,
  },
  balanceCard: {
    borderRadius: 30, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  balanceInner: { padding: 26 },
  pillRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: BorderRadius.full,
    borderWidth: 1.5, borderColor: 'rgba(13,13,13,0.5)',
  },
  pillActive: { backgroundColor: 'rgba(13,13,13,0.12)' },
  pillText: { fontFamily: Typography.fontFamily.mono, fontSize: 10, color: Colors.inkBlack, letterSpacing: 1 },
  pillActiveText: { fontFamily: Typography.fontFamily.mono, fontSize: 10, color: Colors.inkBlack, letterSpacing: 1, fontWeight: '700' },
  balanceAmount: { fontFamily: Typography.fontFamily.display, fontSize: 66, color: Colors.inkBlack, letterSpacing: -1, marginTop: 4 },
  balanceSub: { fontFamily: Typography.fontFamily.mono, fontSize: 13, color: Colors.inkBlack, opacity: 0.85, letterSpacing: 1, marginTop: 6, marginBottom: Spacing.lg },
  projectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: 24, padding: Spacing.lg, overflow: 'hidden',
  },
  projectedIcon: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)',
  },
  projectedLabel: { fontFamily: Typography.fontFamily.mono, fontSize: 11, color: Colors.inkBlack, opacity: 0.72, letterSpacing: 1 },
  projectedAmount: { fontFamily: Typography.fontFamily.monoBold, fontSize: 32, color: Colors.inkBlack, marginTop: 2 }, // IBM Plex Mono Bold
  // ---- Category carousel ----
  cardScroll: { gap: Spacing.sm, paddingVertical: Spacing.xs, paddingLeft: Layout.screenPadding, paddingRight: Spacing.md },
  catCard: { width: 200, borderRadius: 22, padding: Spacing.md, justifyContent: 'space-between', minHeight: 130, overflow: 'hidden' },
  catCardActiveFill: { backgroundColor: '#2E390E' }, // dark olive (mockup BILLS card)
  catCardActiveGlow: {
    borderWidth: 1.5, borderColor: Colors.limeElectric,
    shadowColor: Colors.limeElectric, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  catCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  catCardLabel: { fontFamily: Typography.fontFamily.display, fontSize: 18, letterSpacing: 0.5 },
  catCount: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  catCountText: { fontFamily: Typography.fontFamily.mono, fontSize: 12, fontWeight: '700' },
  catCardValue: { fontFamily: Typography.fontFamily.mono, fontSize: 26, fontWeight: '700' },
  catCardSub: { fontFamily: Typography.fontFamily.mono, fontSize: 10, letterSpacing: 1, marginTop: 4 },
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
  // ---- Lime bills panel + branded rows ----
  // Full-bleed: breaks out of the body's horizontal padding to the screen edges.
  limePanel: {
    marginHorizontal: -Layout.screenPadding,
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.xl, paddingBottom: 48,
    borderTopLeftRadius: 34, borderTopRightRadius: 34,
    marginTop: Spacing.lg,
  },
  panelTitle: { fontFamily: Typography.fontFamily.mono, fontSize: 22, fontWeight: '700', color: Colors.inkBlack, letterSpacing: 3, marginTop: 4 },
  panelHint: { fontFamily: Typography.fontFamily.mono, fontSize: 12, fontStyle: 'italic', color: Colors.inkBlack, opacity: 0.7, letterSpacing: 1, marginBottom: Spacing.lg },
  billRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, marginBottom: Spacing.sm,
  },
  billMid: { flex: 1, paddingHorizontal: Spacing.md },
  billName: { fontSize: 18, fontWeight: '800', color: Colors.inkBlack },
  billAmtRed: { fontFamily: Typography.fontFamily.mono, fontSize: 11, color: Colors.brightRed, marginTop: 2 },
  billDue: { fontFamily: Typography.fontFamily.mono, fontSize: 11, color: '#8A8A8A', marginTop: 2 },
  billRight: { alignItems: 'flex-end', gap: 8 },
  billAmtBig: { fontSize: 18, fontWeight: '900', color: Colors.inkBlack },
  paidPill: { backgroundColor: Colors.berryPill, paddingHorizontal: 16, paddingVertical: 7, borderRadius: BorderRadius.full },
  paidPillText: { fontFamily: Typography.fontFamily.mono, fontSize: 11, color: '#FFFFFF', fontWeight: '700', letterSpacing: 1 },
  panelSeeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  panelSeeAllText: { fontFamily: Typography.fontFamily.mono, fontSize: 11, color: Colors.inkBlack, fontWeight: '700', letterSpacing: 1 },
  addBillBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.inkBlack, borderRadius: BorderRadius.full, paddingVertical: 12, marginTop: 4,
  },
  addBillText: { fontFamily: Typography.fontFamily.mono, fontSize: 12, color: Colors.limeElectric, fontWeight: '700', letterSpacing: 2 },
  paidHint: { fontFamily: Typography.fontFamily.mono, fontSize: 10, color: Colors.inkBlack, opacity: 0.6, letterSpacing: 1, marginTop: Spacing.md, marginBottom: 4 },
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
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.sm,
    color: 'rgba(13,13,13,0.55)',
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
    gap: 6,
    paddingVertical: 18,
    marginVertical: Spacing.sm,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: Colors.limeElectric, shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  seeAllText: {
    fontFamily: Typography.fontFamily.mono,
    color: Colors.inkBlack,
    fontSize: Typography.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 2,
  },
  // ---- ASK PEPPER aurora card ----
  askGlow: {
    marginTop: Spacing.xl, borderRadius: 30,
    shadowColor: '#F2C24A', shadowOpacity: 0.55, shadowRadius: 26, shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
  askCard: { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  askInner: { padding: Spacing.lg, gap: Spacing.md },
  askTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  askTitle: { fontFamily: Typography.fontFamily.mono, fontSize: 24, fontWeight: '700', color: Colors.saltBone, letterSpacing: 6 },
  askExpand: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
  askPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.32)', borderRadius: BorderRadius.full,
    paddingVertical: 14, paddingLeft: 20, paddingRight: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
  },
  askPillText: { fontFamily: Typography.fontFamily.mono, fontSize: 13, color: Colors.inkBlack, letterSpacing: 2 },
  askPlus: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  askDump: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.32)', borderRadius: BorderRadius.full,
    paddingVertical: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
  },
  askMic: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(13,13,13,0.78)',
  },
  askDumpText: { fontFamily: Typography.fontFamily.mono, fontSize: 13, color: Colors.inkBlack, letterSpacing: 2 },
});
