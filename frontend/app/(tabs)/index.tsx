import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { CategoryCard } from '../../src/components/CategoryCard';
import { PepperBubble } from '../../src/components/PepperBubble';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { DatePicker } from '../../src/components/DatePicker';
import { CompletedCalendar } from '../../src/components/CompletedCalendar';
import { DateCarousel } from '../../src/components/DateCarousel';
import { scheduleReengagement } from '../../src/utils/pepperNudges';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import apiClient from '../../src/services/api';
import { useAppStore } from '../../src/store/appStore';
import { getPepperGreeting } from '../../src/utils/pepperMood';
import {
  priorityReaction,
  loopDoneReaction,
  loopOverdueNudge,
  loopDueTodayNudge,
} from '../../src/utils/pepperReactions';

export default function TodayScreen() {
  const { currentUserId, nickname, notifications } = useAppStore();
  const [todayEntry, setTodayEntry] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskForm, setTaskForm] = useState<{ title: string; next_action: string; deadline: string; time: string; subtasks: { title: string; done: boolean }[]; non_negotiable: boolean; kind: string; scheduled_date: string }>({ title: '', next_action: '', deadline: '', time: '', subtasks: [], non_negotiable: false, kind: 'task', scheduled_date: '' });
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [pepperReaction, setPepperReaction] = useState<string | null>(null);
  const [dayDone, setDayDone] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expandedLoops, setExpandedLoops] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [dedupeGroups, setDedupeGroups] = useState<any[]>([]);
  const [dedupeLoading, setDedupeLoading] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  // Ask PEPPER to scan open loops for duplicates worth merging.
  const checkRepeats = async () => {
    setDedupeLoading(true);
    try {
      const r = await apiClient.post('/pepper/dedupe-loops', {}, { params: { user_id: currentUserId } });
      const groups = r.data?.groups || [];
      setDedupeGroups(groups);
      if (!groups.length) Alert.alert('All clear', "PEPPER doesn't see any repeats. Tidy queen.");
    } catch (e) {
      Alert.alert('Hmm', "PEPPER couldn't check right now.");
    } finally {
      setDedupeLoading(false);
    }
  };

  const mergeGroup = (group: any) => {
    const drop = (group.task_ids || []).filter((id: string) => id !== group.keep_id);
    const keepTitle = (group.items || []).find((it: any) => it.id === group.keep_id)?.title || 'one';
    Alert.alert(
      'Merge repeats?',
      `Keep "${keepTitle}" and delete the ${drop.length} duplicate${drop.length === 1 ? '' : 's'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge', style: 'destructive', onPress: async () => {
            try { await Promise.all(drop.map((id: string) => apiClient.delete(`/tasks/${id}`))); } catch {}
            setDedupeGroups((prev) => prev.filter((g) => g !== group));
            loadAll();
          },
        },
      ]
    );
  };

  const dismissGroup = (group: any) => setDedupeGroups((prev) => prev.filter((g) => g !== group));

  // --- PEPPER "organize" (rank + schedule across days) ---
  const [planModal, setPlanModal] = useState(false);
  const [plan, setPlan] = useState<any[]>([]);
  const [planClarify, setPlanClarify] = useState<any[]>([]);
  const [planLoading, setPlanLoading] = useState(false);

  const organizeDay = async () => {
    setPlanLoading(true);
    try {
      const r = await apiClient.post('/pepper/organize', { start_date: today }, { params: { user_id: currentUserId }, timeout: 120000 });
      const p = r.data?.plan || [];
      setPlan(p);
      setPlanClarify(r.data?.clarify || []);
      if (!p.length) Alert.alert('Nothing to plan', 'No open loops to organize.');
      else setPlanModal(true);
    } catch (e) {
      Alert.alert('Hmm', "PEPPER couldn't plan right now.");
    } finally {
      setPlanLoading(false);
    }
  };

  const applyPlan = async () => {
    try {
      await Promise.all(plan.map((p) => {
        const task = tasks.find((t) => t.id === p.task_id);
        if (!task) return Promise.resolve(null);
        const payload: any = { ...task, scheduled_date: p.scheduled_date || null, time: p.time || task.time || null };
        delete payload.id; delete payload.user_id; delete payload.created_at; delete payload.updated_at;
        return apiClient.put(`/tasks/${p.task_id}`, payload);
      }));
    } catch (e) { console.error(e); }
    setPlanModal(false);
    loadAll();
  };

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setExpandedLoops((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const [overdueNudgeSeed] = useState(() => Math.floor(Math.random() * 100));

  const today = new Date().toISOString().split('T')[0];
  const todayDate = new Date();
  const dayName = todayDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const monthDay = todayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Auto-clear the floating PEPPER reaction
  useEffect(() => {
    if (!pepperReaction) return;
    const t = setTimeout(() => setPepperReaction(null), 4500);
    return () => clearTimeout(t);
  }, [pepperReaction]);

  const loadAll = async () => {
    try {
      const [entryRes, tasksRes] = await Promise.all([
        apiClient.get(`/daily-entries/${currentUserId}/${selectedDate}`).catch(() => ({ data: null })),
        apiClient.get(`/tasks/${currentUserId}`).catch(() => ({ data: [] })),
      ]);
      setTodayEntry(entryRes.data);
      setTasks(tasksRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(useCallback(() => {
    loadAll();
    // User is active again — reset PEPPER's away-clock / mood ladder.
    if (notifications?.enabled) scheduleReengagement().catch(() => {});
  }, [notifications?.enabled, selectedDate]));
  useEffect(() => { loadAll(); }, [selectedDate]);

  const toggleCheck = async (field: string, current: boolean) => {
    if (!todayEntry) {
      // Create a minimal entry first
      const created = await apiClient.post(
        `/daily-entries?user_id=${currentUserId}`,
        { date: selectedDate, [field]: !current }
      );
      setTodayEntry(created.data);
      return;
    }
    const updated = { ...todayEntry, [field]: !current };
    delete (updated as any).id;
    delete (updated as any).user_id;
    delete (updated as any).created_at;
    delete (updated as any).updated_at;
    const r = await apiClient.put(`/daily-entries/${todayEntry.id}`, updated);
    setTodayEntry(r.data);
  };

  const openTaskEditor = (task?: any) => {
    if (task) {
      setEditingTask(task);
      setTaskForm({ title: task.title, next_action: task.next_action || '', deadline: task.deadline || '', time: task.time || '', subtasks: Array.isArray(task.subtasks) ? task.subtasks : [], non_negotiable: !!task.non_negotiable, kind: task.kind || 'task', scheduled_date: task.scheduled_date || '' });
    } else {
      setEditingTask(null);
      setTaskForm({ title: '', next_action: '', deadline: '', time: '', subtasks: [], non_negotiable: false, kind: 'task', scheduled_date: '' });
    }
    setSubtaskDraft('');
    setTaskModal(true);
  };

  const saveTask = async () => {
    if (!taskForm.title.trim()) {
      Alert.alert('Hold up', 'Give it a name first.');
      return;
    }
    const payload = {
      title: taskForm.title,
      next_action: taskForm.next_action,
      deadline: taskForm.deadline,
      time: taskForm.time.trim() || null,
      subtasks: taskForm.subtasks,
      non_negotiable: taskForm.non_negotiable,
      kind: taskForm.kind,
      scheduled_date: taskForm.scheduled_date || null,
      status: editingTask?.status || 'not_started',
      parked: editingTask?.parked || false,
    };
    if (editingTask) {
      await apiClient.put(`/tasks/${editingTask.id}`, payload);
    } else {
      await apiClient.post(`/tasks?user_id=${currentUserId}`, payload);
    }
    setTaskModal(false);
    loadAll();
  };

  const cycleStatus = async (task: any) => {
    const order = ['not_started', 'in_progress', 'waiting', 'done'];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    const wasDone = task.status === 'done';
    const nowDone = next === 'done';
    const payload = { ...task, status: next };
    delete payload.id;
    delete payload.user_id;
    delete payload.created_at;
    delete payload.updated_at;
    await apiClient.put(`/tasks/${task.id}`, payload);
    if (wasDone !== nowDone) {
      await syncLinkedPriority(task.id, nowDone);
    }
    if (!wasDone && nowDone) {
      setPepperReaction(loopDoneReaction());
    }
    loadAll();
  };

  const togglePriorityDone = async (i: number) => {
    if (!todayEntry) return;
    const priorities = todayEntry.top_priorities || [];
    const current: boolean[] = (todayEntry.priorities_done || []).slice();
    const taskIds: (string | null)[] = (todayEntry.priorities_task_ids || []).slice();
    while (current.length < priorities.length) current.push(false);
    const wasDone = !!current[i];
    current[i] = !wasDone;

    // Optimistic update
    setTodayEntry({ ...todayEntry, priorities_done: current });

    const totalDone = current.filter(Boolean).length;
    const reaction = priorityReaction({
      newlyDone: !wasDone,
      totalDone,
      totalPriorities: priorities.length,
    });
    setPepperReaction(reaction);

    const updated = { ...todayEntry, priorities_done: current };
    delete (updated as any).id;
    delete (updated as any).user_id;
    delete (updated as any).created_at;
    delete (updated as any).updated_at;
    try {
      const r = await apiClient.put(`/daily-entries/${todayEntry.id}`, updated);
      setTodayEntry(r.data);
      // Sync the linked Loop if there is one
      const linkedTaskId = taskIds[i];
      if (linkedTaskId) {
        const linkedTask = tasks.find((t) => t.id === linkedTaskId);
        if (linkedTask) {
          const newStatus = !wasDone ? 'done' : 'in_progress';
          if (linkedTask.status !== newStatus) {
            const taskPayload = { ...linkedTask, status: newStatus };
            delete taskPayload.id;
            delete taskPayload.user_id;
            delete taskPayload.created_at;
            delete taskPayload.updated_at;
            await apiClient.put(`/tasks/${linkedTaskId}`, taskPayload);
          }
        }
      }
      // Refresh tasks list to reflect sync
      loadAll();
    } catch (e) {
      // Revert on failure
      const reverted = current.slice();
      reverted[i] = wasDone;
      setTodayEntry({ ...todayEntry, priorities_done: reverted });
    }
  };

  const markLoopDone = async (task: any) => {
    const payload = { ...task, status: 'done' };
    delete payload.id;
    delete payload.user_id;
    delete payload.created_at;
    delete payload.updated_at;
    await apiClient.put(`/tasks/${task.id}`, payload);
    // If this task is linked to a Top 3 priority, also sync
    await syncLinkedPriority(task.id, true);
    setPepperReaction(loopDoneReaction());
    loadAll();
  };

  const reopenLoop = async (task: any) => {
    const payload = { ...task, status: 'in_progress' };
    delete payload.id;
    delete payload.user_id;
    delete payload.created_at;
    delete payload.updated_at;
    await apiClient.put(`/tasks/${task.id}`, payload);
    await syncLinkedPriority(task.id, false);
    setPepperReaction("ok. moved it back to in-progress. set a real date this time.");
    loadAll();
  };

  // Helper: keep priorities_done in sync when a linked task changes
  const syncLinkedPriority = async (taskId: string, done: boolean) => {
    if (!todayEntry) return;
    const taskIds: (string | null)[] = todayEntry.priorities_task_ids || [];
    const idx = taskIds.indexOf(taskId);
    if (idx < 0) return;
    const current: boolean[] = (todayEntry.priorities_done || []).slice();
    while (current.length <= idx) current.push(false);
    if (current[idx] === done) return; // already in sync
    current[idx] = done;
    const updated = { ...todayEntry, priorities_done: current };
    delete (updated as any).id;
    delete (updated as any).user_id;
    delete (updated as any).created_at;
    delete (updated as any).updated_at;
    try {
      const r = await apiClient.put(`/daily-entries/${todayEntry.id}`, updated);
      setTodayEntry(r.data);
    } catch {}
  };

  const deleteTask = async (id: string) => {
    await apiClient.delete(`/tasks/${id}`);
    setTaskModal(false);
    loadAll();
  };

  const BURNOUT_THRESHOLD = 6;

  // Promote the next active loops into the Top 3 (with a burnout gut-check).
  const loadNext3 = async () => {
    if (!todayEntry) return;
    const proceed = async () => {
      const currentTitles = new Set((todayEntry.top_priorities || []).map((p: string) => p.toLowerCase()));
      const candidates = otherActiveTasks
        .filter((t) => !currentTitles.has((t.title || '').toLowerCase()))
        .slice(0, 3);
      if (candidates.length === 0) {
        Alert.alert('Nothing queued', "No more loops to promote. Dump to PEPPER or call it a day.");
        return;
      }
      const newPriorities = candidates.map((t) => t.title);
      const updated = {
        ...todayEntry,
        top_priorities: newPriorities,
        priorities_done: newPriorities.map(() => false),
        priorities_task_ids: candidates.map((t) => t.id),
      };
      delete (updated as any).id; delete (updated as any).user_id;
      delete (updated as any).created_at; delete (updated as any).updated_at;
      const r = await apiClient.put(`/daily-entries/${todayEntry.id}`, updated);
      setTodayEntry(r.data);
      loadAll();
    };

    if (completedTodayCount >= BURNOUT_THRESHOLD) {
      Alert.alert(
        'Burnout check',
        `That's ${completedTodayCount} done today. Loading more is how you crash tomorrow. Sure?`,
        [
          { text: 'Call it', style: 'cancel', onPress: () => setDayDone(true) },
          { text: 'Load 3 anyway', style: 'destructive', onPress: proceed },
        ]
      );
    } else {
      proceed();
    }
  };

  // Order by time-of-day: timed tasks first (chronological), untimed last.
  const byTime = (a: any, b: any) => (a.time || '99:99').localeCompare(b.time || '99:99');
  const statusGlyph = (s: string) => (s === 'in_progress' ? '◐' : s === 'waiting' ? '◑' : '○');

  const activeTasks = tasks.filter((t) => !t.parked && t.status !== 'done');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const parkedTasks = tasks.filter((t) => t.parked);

  // Deadline-aware bucketing (each bucket ordered by time-of-day)
  const overdueTasks = activeTasks.filter(
    (t) => t.deadline && t.deadline < today
  ).sort(byTime);
  const dueTodayTasks = activeTasks.filter((t) => t.deadline === today).sort(byTime);
  const otherActiveTasks = activeTasks.filter(
    (t) => !t.deadline || t.deadline > today
  ).sort(byTime);

  const selectedIsToday = selectedDate === today;
  // Day timeline = tasks planned for the selected day. Back-compat: a timed task
  // with no scheduled_date belongs to "today".
  const timedTasks = activeTasks
    .filter((t) => (t.scheduled_date ? t.scheduled_date === selectedDate : (t.time && selectedIsToday)))
    .sort(byTime);
  // Open Loops = the unscheduled backlog (no day, no time). Non-negotiables float up.
  const untimedTasks = activeTasks
    .filter((t) => !t.scheduled_date && !t.time)
    .sort((a, b) => (b.non_negotiable ? 1 : 0) - (a.non_negotiable ? 1 : 0) || byTime(a, b));

  // Toggle a subtask's done flag and persist.
  const toggleSubtask = async (task: any, idx: number) => {
    const subtasks = (task.subtasks || []).slice();
    if (!subtasks[idx]) return;
    subtasks[idx] = { ...subtasks[idx], done: !subtasks[idx].done };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks } : t)));
    const payload = { ...task, subtasks };
    delete payload.id; delete payload.user_id; delete payload.created_at; delete payload.updated_at;
    try { await apiClient.put(`/tasks/${task.id}`, payload); } catch { loadAll(); }
  };

  // Priority completion state
  const priorities: string[] = todayEntry?.top_priorities || [];
  const prioritiesDone: boolean[] = todayEntry?.priorities_done || [];
  const prioritiesTaskIds: (string | null)[] = todayEntry?.priorities_task_ids || [];
  // Only show Top-3 items whose linked task is unscheduled or scheduled for the
  // day being viewed — keep later-day work off today's Top 3. Keep original
  // indices so done/toggle stay correct.
  const visiblePriorities = priorities
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => {
      const tid = prioritiesTaskIds[i];
      if (!tid) return true;
      const task = tasks.find((t) => t.id === tid);
      if (!task) return true;
      return !task.scheduled_date || task.scheduled_date === selectedDate;
    })
    .slice(0, 3);
  const allTopDone =
    visiblePriorities.length > 0 &&
    visiblePriorities.every(({ i }) => !!prioritiesDone[i]);

  // How many loops were completed today (drives the burnout warning).
  const completedTodayCount = doneTasks.filter(
    (t) => (t.completed_at || '').slice(0, 10) === today
  ).length;

  const greeting = getPepperGreeting(todayDate);
  const heroGreeting = greeting.greeting(nickname);

  const accentColor =
    greeting.accent === 'lime'
      ? Colors.pickleLime
      : greeting.accent === 'lilac'
      ? Colors.softSpiceLilac
      : Colors.brightRed;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* atmospheric gradient blobs behind content */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient colors={['rgba(196,25,30,0.18)', 'transparent']} style={[styles.blob, { top: -60, right: -40 }]} />
        <LinearGradient colors={['rgba(124,107,166,0.16)', 'transparent']} style={[styles.blob, { top: 280, left: -70 }]} />
        <LinearGradient colors={['rgba(168,189,79,0.12)', 'transparent']} style={[styles.blob, { bottom: 30, right: -50 }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brightRed} colors={[Colors.brightRed]} />
        }
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={[styles.dateLabel, { color: accentColor }]}>
            {dayName} · {monthDay.toUpperCase()}
          </Text>
          <Text style={[styles.moodLabel, { color: accentColor }]}>{greeting.mood}</Text>
          <Text style={styles.heroTitle}>{heroGreeting}</Text>
          <Text style={styles.heroSub}>{greeting.vibe}</Text>
        </View>

        {/* Date planner strip */}
        <DateCarousel selected={selectedDate} today={today} onSelect={setSelectedDate} />
        {!selectedIsToday && (
          <TouchableOpacity style={styles.backToToday} onPress={() => setSelectedDate(today)}>
            <Ionicons name="arrow-back" size={12} color={Colors.brightRed} />
            <Text style={styles.backToTodayText}>viewing another day · back to today</Text>
          </TouchableOpacity>
        )}

        {/* Floating PEPPER reaction */}
        {pepperReaction && (
          <PepperBubble label="* PEPPER" variant="red" small style={{ marginTop: Spacing.sm }}>
            {pepperReaction}
          </PepperBubble>
        )}

        {/* PEPPER verdict */}
        <LinearGradient
          colors={overdueTasks.length > 0 ? ['rgba(255,0,54,0.22)', 'rgba(18,16,20,0.5)'] : ['rgba(196,25,30,0.14)', 'rgba(18,16,20,0.5)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.verdict}
        >
          <Text style={styles.verdictLabel}>PEPPER'S VERDICT</Text>
          <Text style={styles.verdictMain}>
            {todayEntry?.next_sane_step
              || (priorities.length > 0 ? 'lock the top 3. ignore the rest.' : "dump to the flame. i'll cut it.")}
          </Text>
          <View style={styles.verdictChips}>
            {visiblePriorities.length > 0 && (
              <View style={styles.verdictChip}>
                <Text style={styles.verdictChipText}>{visiblePriorities.filter(({ i }) => prioritiesDone[i]).length}/{visiblePriorities.length} top 3</Text>
              </View>
            )}
            {overdueTasks.length > 0 && (
              <View style={[styles.verdictChip, styles.verdictChipUrgent]}>
                <Text style={[styles.verdictChipText, { color: Colors.saltBone }]}>{overdueTasks.length} overdue</Text>
              </View>
            )}
            {timedTasks.length > 0 && (
              <View style={styles.verdictChip}>
                <Text style={styles.verdictChipText}>{timedTasks.length} on the clock</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* Overdue quick-actions */}
        {overdueTasks.length > 0 && (
          <View style={styles.actionList}>
            {overdueTasks.slice(0, 3).map((t) => (
              <View key={t.id} style={styles.actionRow}>
                <View style={styles.actionDotRed} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.actionMetaRed}>overdue · {t.deadline}</Text>
                </View>
                <TouchableOpacity style={styles.didItBtn} onPress={() => markLoopDone(t)}>
                  <Text style={styles.didItText}>DID IT</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nahBtn} onPress={() => reopenLoop(t)}>
                  <Text style={styles.nahText}>NAH</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Organize / plan my days */}
        {activeTasks.length > 0 && (
          <TouchableOpacity style={styles.organizeBtn} onPress={organizeDay} disabled={planLoading} testID="organize-btn">
            {planLoading
              ? <ActivityIndicator size="small" color={Colors.inkBlack} />
              : <Ionicons name="sparkles" size={16} color={Colors.inkBlack} />}
            <Text style={styles.organizeText}>
              {planLoading ? 'PEPPER IS PLANNING…' : untimedTasks.length > 0 ? 'ORGANIZE MY DAYS' : 'RE-PLAN MY DAYS'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Top 3 — now checkable */}
        {visiblePriorities.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>TOP 3.</Text>
            <Text style={styles.sectionHint}>{selectedIsToday ? 'the only three that matter today. tap to close one.' : "this day's top three."}</Text>
            {visiblePriorities.map(({ p, i }, pos) => {
              const done = !!prioritiesDone[i];
              const hero = pos === 0 && !done;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.p3, hero && styles.p3Hero, done && styles.p3Done]}
                  onPress={() => togglePriorityDone(i)}
                  activeOpacity={0.85}
                  testID={`priority-${i}`}
                >
                  <View style={[styles.p3Num, hero && styles.p3NumHero, done && styles.p3NumDone]}>
                    {done
                      ? <Ionicons name="checkmark" size={16} color={Colors.inkBlack} />
                      : <Text style={[styles.p3NumText, hero && { color: Colors.inkBlack }]}>{pos + 1}</Text>}
                  </View>
                  <Text style={[styles.p3Text, hero && { color: Colors.inkBlack }, done && styles.p3TextDone]} numberOfLines={2}>
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {allTopDone && !dayDone && (
              <View style={styles.nextWrap}>
                <PepperBubble label="* PEPPER" variant="lime">
                  {completedTodayCount >= BURNOUT_THRESHOLD
                    ? `that's ${completedTodayCount} done today. legend — but you're flirting with burnout. i'd call it.`
                    : `top 3 done. next 3, or are we done for the day?`}
                </PepperBubble>
                <View style={styles.nextRow}>
                  <Button title="NEXT 3" onPress={loadNext3} variant="secondary" style={{ flex: 1 }} />
                  <Button title="DONE FOR TODAY" onPress={() => setDayDone(true)} variant="primary" style={{ flex: 1 }} />
                </View>
              </View>
            )}
            {allTopDone && dayDone && (
              <PepperBubble label="* PEPPER" variant="lime" style={{ marginTop: Spacing.sm }}>
                {completedTodayCount} done today. close the laptop. drink water. we go again tomorrow.
              </PepperBubble>
            )}
          </>
        )}

        {/* Survival basics */}
        <Text style={styles.sectionLabel}>SURVIVAL BASICS.</Text>
        <View style={styles.basicsRow}>
          {(['water_checked', 'food_checked', 'hygiene_checked'] as const).map((field, i) => {
            const checked = todayEntry?.[field] || false;
            const labels = ['WATER', 'FOOD', 'HYGIENE'];
            const icons: any[] = ['water', 'restaurant', 'sparkles'];
            return (
              <TouchableOpacity
                key={field}
                style={[styles.basicTile, checked && styles.basicTileChecked]}
                onPress={() => toggleCheck(field, checked)}
                testID={`survival-${labels[i].toLowerCase()}`}
              >
                <Ionicons
                  name={checked ? 'checkmark-circle' : icons[i]}
                  size={28}
                  color={checked ? Colors.inkBlack : Colors.softSpiceLilac}
                />
                <Text style={[styles.basicLabel, checked && styles.basicLabelChecked]}>
                  {labels[i]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Day timeline */}
        {timedTasks.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>DAY TIMELINE.</Text>
            <Text style={styles.sectionHint}>your day, roughly in order.</Text>
            <View style={styles.timeline}>
              {timedTasks.map((t, idx) => {
                const isAppt = t.kind === 'appointment';
                return (
                  <View key={t.id} style={styles.tlRow}>
                    <Text style={[styles.tlTime, isAppt && { color: Colors.softSpiceLilac }]}>{t.time || '—'}</Text>
                    <View style={styles.tlLineCol}>
                      <View style={[styles.tlDot, isAppt && styles.tlDotAppt]} />
                      {idx < timedTasks.length - 1 && <View style={styles.tlLine} />}
                    </View>
                    <TouchableOpacity style={[styles.tlCard, isAppt && styles.tlCardAppt]} activeOpacity={0.85} onPress={() => openTaskEditor(t)}>
                      {isAppt
                        ? <Ionicons name="calendar" size={15} color={Colors.softSpiceLilac} />
                        : t.non_negotiable ? <Ionicons name="lock-closed" size={12} color={Colors.brightRed} /> : null}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tlCardTitle} numberOfLines={1}>{t.title}</Text>
                        {t.next_action ? <Text style={styles.tlCardSub} numberOfLines={1}>→ {t.next_action}</Text> : null}
                      </View>
                      <TouchableOpacity style={styles.statusChip} onPress={() => cycleStatus(t)}>
                        <Text style={styles.statusChipText}>{statusGlyph(t.status)}</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Open Loops (merged) */}
        <View style={styles.loopsHeader}>
          <Text style={styles.sectionLabel}>OPEN LOOPS.</Text>
          <View style={styles.loopsHeaderBtns}>
            <TouchableOpacity onPress={checkRepeats} disabled={dedupeLoading} testID="check-repeats-btn">
              <View style={styles.checkRepeatsBtn}>
                {dedupeLoading
                  ? <ActivityIndicator size="small" color={Colors.softSpiceLilac} />
                  : <Ionicons name="git-compare" size={16} color={Colors.softSpiceLilac} />}
                <Text style={styles.checkRepeatsText}>REPEATS?</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openTaskEditor()} testID="add-loop-btn">
              <View style={styles.addLoopBtn}>
                <Ionicons name="add" size={18} color={Colors.saltBone} />
                <Text style={styles.addLoopText}>NEW LOOP</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* PEPPER-flagged duplicates */}
        {dedupeGroups.map((g, gi) => (
          <View key={gi} style={styles.dedupeCard}>
            <Text style={styles.dedupeLabel}>* PEPPER: POSSIBLE REPEAT</Text>
            <Text style={styles.dedupeReason}>{g.reason}</Text>
            {(g.items || []).map((it: any) => (
              <View key={it.id} style={styles.dedupeItem}>
                <Ionicons
                  name={it.id === g.keep_id ? 'checkmark-circle' : 'ellipse-outline'}
                  size={14}
                  color={it.id === g.keep_id ? Colors.pickleLime : Colors.steelBlueGrey}
                />
                <Text style={[styles.dedupeItemText, it.id === g.keep_id && { color: Colors.text, fontWeight: '700' }]}>
                  {it.title}{it.id === g.keep_id ? '  · keep' : ''}
                </Text>
              </View>
            ))}
            <View style={styles.dedupeActions}>
              <Button title="KEEP BOTH" variant="ghost" onPress={() => dismissGroup(g)} style={{ flex: 1 }} />
              <Button title="MERGE" variant="primary" onPress={() => mergeGroup(g)} style={{ flex: 1 }} />
            </View>
          </View>
        ))}

        {untimedTasks.length === 0 ? (
          <View style={styles.emptyLoops}>
            <Text style={styles.emptyText}>
              {timedTasks.length > 0 ? "No loose loops — it's all on the clock." : 'No loops. Clean kitchen.'}
            </Text>
          </View>
        ) : (
          untimedTasks.map((task) => {
            const subs = (task.subtasks || []) as { title: string; done: boolean }[];
            const doneCount = subs.filter((s) => s.done).length;
            const complete = subs.length > 0 && doneCount === subs.length;
            const expanded = !!expandedLoops[task.id];
            const nextStep = subs.find((s) => !s.done)?.title;
            return (
              <View key={task.id} style={[styles.loopCard, task.non_negotiable && styles.loopCardNN]}>
                <View style={styles.loopHeaderRow}>
                  <TouchableOpacity
                    style={styles.loopMain}
                    activeOpacity={0.8}
                    onPress={() => (subs.length > 0 ? toggleExpand(task.id) : openTaskEditor(task))}
                  >
                    <View style={[styles.ring, complete && styles.ringDone]}>
                      {subs.length > 0
                        ? <Text style={[styles.ringText, complete && { color: Colors.inkBlack }]}>{doneCount}/{subs.length}</Text>
                        : <View style={styles.ringEmptyDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.loopTitleRow}>
                        {task.non_negotiable && <Ionicons name="lock-closed" size={12} color={Colors.brightRed} />}
                        <Text style={styles.loopTitle} numberOfLines={1}>{task.title}</Text>
                      </View>
                      <Text style={styles.loopPreview} numberOfLines={1}>
                        {subs.length > 0
                          ? (nextStep ? `next: ${nextStep}` : 'all steps done — close it')
                          : task.next_action ? `→ ${task.next_action}` : task.deadline ? `due ${task.deadline}` : 'tap to edit'}
                      </Text>
                    </View>
                    {subs.length > 0 && (
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSubtle} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.statusChip} onPress={() => cycleStatus(task)}>
                    <Text style={styles.statusChipText}>{statusGlyph(task.status)}</Text>
                  </TouchableOpacity>
                </View>
                {expanded && subs.length > 0 && (
                  <View style={styles.loopSteps}>
                    {subs.map((st, i) => (
                      <TouchableOpacity key={i} style={styles.loopStepRow} onPress={() => toggleSubtask(task, i)}>
                        <Ionicons name={st.done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={st.done ? Colors.pickleLime : Colors.steelBlueGrey} />
                        <Text style={[styles.loopStepText, st.done && styles.subtaskTextDone]}>{st.title}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={() => openTaskEditor(task)}>
                      <Text style={styles.loopEdit}>EDIT LOOP →</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}

        {parkedTasks.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>PARKED.</Text>
            {parkedTasks.map((task) => (
              <CategoryCard
                key={task.id}
                title={task.title}
                badge="P"
                variant="dark"
                onPress={() => openTaskEditor(task)}
              />
            ))}
          </>
        )}

        {doneTasks.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>DONE.</Text>
            <Text style={styles.sectionHint}>{doneTasks.length} loops closed.</Text>
            <TouchableOpacity style={styles.calendarBtn} onPress={() => setCalendarOpen(true)}>
              <Ionicons name="calendar-outline" size={16} color={Colors.text} />
              <Text style={styles.calendarBtnText}>VIEW DONE CALENDAR</Text>
            </TouchableOpacity>
          </>
        )}

        {!todayEntry && (
          <PepperBubble label="* PEPPER" variant="red" style={{ marginTop: Spacing.lg }}>
            No plan yet. Tap the flame to dump and I'll sort it.
          </PepperBubble>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <CompletedCalendar visible={calendarOpen} onClose={() => setCalendarOpen(false)} tasks={tasks} />

      {/* PEPPER plan review */}
      <Modal visible={planModal} animationType="slide" transparent onRequestClose={() => setPlanModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.planSheet}>
            <Text style={styles.editorTitle}>PEPPER'S PLAN</Text>
            <Text style={styles.sectionHint}>spread across your days. apply now, or tweak after.</Text>
            <ScrollView style={{ maxHeight: 430 }}>
              {Object.entries(
                plan.reduce((acc: Record<string, any[]>, p: any) => {
                  const d = p.scheduled_date || 'Someday';
                  (acc[d] = acc[d] || []).push(p);
                  return acc;
                }, {})
              ).map(([date, items]) => (
                <View key={date} style={{ marginTop: Spacing.md }}>
                  <Text style={styles.planDate}>{date === today ? 'TODAY' : date}</Text>
                  {(items as any[]).map((p) => (
                    <View key={p.task_id} style={styles.planItem}>
                      <Text style={styles.planTime}>{p.time || '—'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planItemTitle} numberOfLines={1}>
                          {p.kind === 'appointment' ? '📅 ' : ''}{p.title}{p.non_negotiable ? '  🔒' : ''}
                        </Text>
                        {p.reason ? <Text style={styles.planReason} numberOfLines={1}>{p.reason}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
              {planClarify.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: Colors.softSpiceLilac, marginTop: Spacing.lg }]}>PEPPER NEEDS TO KNOW</Text>
                  {planClarify.map((c: any, i: number) => (
                    <View key={i} style={styles.planClarify}>
                      <Text style={styles.planClarifyQ}>{c.question}</Text>
                      <Text style={styles.planClarifyT}>{c.title}</Text>
                    </View>
                  ))}
                  <Text style={styles.sectionHint}>answer by editing that loop, then re-organize.</Text>
                </>
              )}
            </ScrollView>
            <View style={styles.editorActions}>
              <Button title="CANCEL" variant="ghost" onPress={() => setPlanModal(false)} style={{ flex: 1 }} />
              <Button title="APPLY PLAN" variant="primary" onPress={applyPlan} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Task editor */}
      <Modal visible={taskModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.editorScroll}>
            <View style={styles.editorCard}>
              <Text style={styles.editorTitle}>{editingTask ? 'EDIT LOOP' : 'NEW LOOP'}</Text>
              <Input
                label="WHAT IS IT?"
                value={taskForm.title}
                onChangeText={(t) => setTaskForm({ ...taskForm, title: t })}
                placeholder="Send pitch deck"
              />
              <Input
                label="NEXT ACTION"
                value={taskForm.next_action}
                onChangeText={(t) => setTaskForm({ ...taskForm, next_action: t })}
                placeholder="The actual next move"
              />
              <DatePicker
                label="DEADLINE"
                value={taskForm.deadline}
                onChange={(v) => setTaskForm({ ...taskForm, deadline: v })}
                placeholder="Pick a deadline (optional)"
                variant="red"
              />
              <View style={styles.kindRow}>
                {(['task', 'appointment'] as const).map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kindBtn, taskForm.kind === k && styles.kindBtnOn]}
                    onPress={() => setTaskForm({ ...taskForm, kind: k })}
                  >
                    <Ionicons name={k === 'appointment' ? 'calendar' : 'ellipse-outline'} size={14} color={taskForm.kind === k ? Colors.inkBlack : Colors.textSubtle} />
                    <Text style={[styles.kindBtnText, taskForm.kind === k && { color: Colors.inkBlack }]}>{k === 'appointment' ? 'APPOINTMENT' : 'TASK'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <DatePicker
                label="DAY (when to do it)"
                value={taskForm.scheduled_date}
                onChange={(v) => setTaskForm({ ...taskForm, scheduled_date: v })}
                placeholder="Pick a day (or leave in backlog)"
                variant="lime"
              />

              <Input
                label={taskForm.kind === 'appointment' ? 'TIME (HH:MM)' : 'TIME (optional, HH:MM)'}
                value={taskForm.time}
                onChangeText={(t) => setTaskForm({ ...taskForm, time: t })}
                placeholder="14:30"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />

              <TouchableOpacity
                style={[styles.nnToggle, taskForm.non_negotiable && styles.nnToggleOn]}
                onPress={() => setTaskForm({ ...taskForm, non_negotiable: !taskForm.non_negotiable })}
              >
                <Ionicons
                  name={taskForm.non_negotiable ? 'lock-closed' : 'lock-open-outline'}
                  size={18}
                  color={taskForm.non_negotiable ? Colors.inkBlack : Colors.brightRed}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.nnToggleLabel, taskForm.non_negotiable && { color: Colors.inkBlack }]}>NON-NEGOTIABLE</Text>
                  <Text style={[styles.nnToggleHint, taskForm.non_negotiable && { color: Colors.inkBlack }]}>must-do today — PEPPER won't bump or park it</Text>
                </View>
                <Ionicons
                  name={taskForm.non_negotiable ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={taskForm.non_negotiable ? Colors.inkBlack : Colors.steelBlueGrey}
                />
              </TouchableOpacity>

              {/* Subtasks */}
              <Text style={styles.subtaskHeader}>SUBTASKS</Text>
              {taskForm.subtasks.map((st, i) => (
                <View key={i} style={styles.subtaskRow}>
                  <TouchableOpacity
                    onPress={() => {
                      const next = taskForm.subtasks.slice();
                      next[i] = { ...next[i], done: !next[i].done };
                      setTaskForm({ ...taskForm, subtasks: next });
                    }}
                  >
                    <Ionicons name={st.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={st.done ? Colors.pickleLime : Colors.steelBlueGrey} />
                  </TouchableOpacity>
                  <Text style={[styles.subtaskText, st.done && styles.subtaskTextDone]}>{st.title}</Text>
                  <TouchableOpacity onPress={() => setTaskForm({ ...taskForm, subtasks: taskForm.subtasks.filter((_, j) => j !== i) })}>
                    <Ionicons name="close" size={18} color={Colors.steelBlueGrey} />
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.subtaskAddRow}>
                <Input
                  value={subtaskDraft}
                  onChangeText={setSubtaskDraft}
                  placeholder="Add a step…"
                  style={{ flex: 1 }}
                  onSubmitEditing={() => {
                    if (subtaskDraft.trim()) {
                      setTaskForm({ ...taskForm, subtasks: [...taskForm.subtasks, { title: subtaskDraft.trim(), done: false }] });
                      setSubtaskDraft('');
                    }
                  }}
                />
                <TouchableOpacity
                  style={styles.subtaskAddBtn}
                  onPress={() => {
                    if (subtaskDraft.trim()) {
                      setTaskForm({ ...taskForm, subtasks: [...taskForm.subtasks, { title: subtaskDraft.trim(), done: false }] });
                      setSubtaskDraft('');
                    }
                  }}
                >
                  <Ionicons name="add" size={22} color={Colors.inkBlack} />
                </TouchableOpacity>
              </View>

              <View style={styles.editorActions}>
                <Button title="CANCEL" onPress={() => setTaskModal(false)} variant="ghost" />
                <Button title="SAVE" onPress={saveTask} variant="primary" />
              </View>
              {editingTask && (
                <Button
                  title="DELETE"
                  onPress={() => deleteTask(editingTask.id)}
                  variant="danger"
                  style={{ marginTop: Spacing.md }}
                />
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
  hero: { marginBottom: Spacing.xl },
  dateLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.brightRed,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  moodLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.brightRed,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: Typography.fontSize.display,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 1,
  },
  heroSub: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSubtle,
    fontStyle: 'italic',
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.brightRed,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: Spacing.md,
  },
  sectionHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSubtle,
    marginBottom: Spacing.md,
  },
  basicsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.lg },
  basicTile: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  basicTileChecked: {
    backgroundColor: Colors.softSpiceLilac,
    borderColor: Colors.softSpiceLilac,
  },
  basicLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 6,
  },
  basicLabelChecked: { color: Colors.inkBlack },
  loopsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.sm },
  addLoopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brightRed,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  addLoopText: { color: Colors.saltBone, fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 1, marginLeft: 4 },
  emptyLoops: {
    backgroundColor: Colors.charcoalRaised,
    padding: Layout.cardPaddingLarge,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  emptyText: { color: Colors.textSubtle, fontSize: Typography.fontSize.base, fontStyle: 'italic' },
  statusChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.inkBlack,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipText: { color: Colors.pickleLime, fontSize: 18, fontWeight: '900' },
  // Top 3 checkable cards
  priorityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Layout.cardPadding,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.sm,
  },
  priorityCardLime: {
    backgroundColor: Colors.pickleLime,
    borderColor: Colors.pickleLime,
  },
  priorityCardDone: {
    backgroundColor: Colors.inkBlack,
    borderColor: Colors.borderStrong,
    opacity: 0.6,
  },
  priorityCheckbox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.inkBlack,
    backgroundColor: 'rgba(13,13,13,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  priorityCheckboxDone: {
    backgroundColor: Colors.pickleLime,
    borderColor: Colors.pickleLime,
  },
  priorityNum: { fontSize: Typography.fontSize.md, fontWeight: '900', color: Colors.text },
  priorityText: {
    flex: 1,
    fontSize: Typography.fontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  priorityTextDone: {
    textDecorationLine: 'line-through',
    color: Colors.textSubtle,
    fontWeight: '500',
  },
  // PEPPER nudges (overdue / due today)
  nudgeWrap: { marginTop: Spacing.md, marginBottom: Spacing.sm },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  nudgeTextWrap: { flex: 1 },
  nudgeTitle: { color: Colors.text, fontSize: Typography.fontSize.base, fontWeight: '700' },
  nudgeMeta: { color: Colors.brightRed, fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  nudgeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  nudgeBtnYes: { backgroundColor: Colors.pickleLime },
  nudgeBtnYesText: { color: Colors.inkBlack, fontSize: Typography.fontSize.xs, fontWeight: '900', letterSpacing: 1 },
  nudgeBtnNo: { backgroundColor: Colors.inkBlack, borderWidth: 1, borderColor: Colors.border },
  nudgeBtnNoText: { color: Colors.textSubtle, fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  editorScroll: { padding: Layout.screenPadding, paddingTop: 80 },
  editorCard: { backgroundColor: Colors.charcoal, borderRadius: BorderRadius.xl, padding: Layout.cardPaddingLarge },
  editorTitle: { fontSize: Typography.fontSize.xl, fontWeight: '900', color: Colors.text, letterSpacing: 1, marginBottom: Spacing.lg },
  subtaskHeader: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontWeight: '800', letterSpacing: 1, marginTop: Spacing.md, marginBottom: Spacing.sm },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  subtaskText: { flex: 1, fontSize: Typography.fontSize.base, color: Colors.text },
  subtaskTextDone: { textDecorationLine: 'line-through', color: Colors.textSubtle },
  subtaskAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subtaskAddBtn: { width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.pickleLime, alignItems: 'center', justifyContent: 'center', marginBottom: Layout.componentGap },
  calendarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.sm, marginTop: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border },
  calendarBtnText: { fontSize: Typography.fontSize.xs, color: Colors.text, fontWeight: '800', letterSpacing: 1 },
  nextWrap: { marginTop: Spacing.sm, gap: Spacing.sm },
  nextRow: { flexDirection: 'row', gap: Spacing.sm },
  subtaskNest: { paddingLeft: Spacing.lg, marginTop: -4, marginBottom: Spacing.sm, gap: 4 },
  subtaskNestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  subtaskNestText: { fontSize: Typography.fontSize.sm, color: Colors.textSubtle },
  editorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },

  // --- Redesign additions ---
  blob: { position: 'absolute', width: 260, height: 260, borderRadius: 130, opacity: 0.9 },
  backToToday: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: Spacing.xs },
  backToTodayText: { color: Colors.brightRed, fontSize: Typography.fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },

  verdict: { borderRadius: BorderRadius.xl, padding: Layout.cardPaddingLarge, marginTop: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  verdictLabel: { fontSize: Typography.fontSize.xs, color: Colors.brightRed, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  verdictMain: { fontSize: Typography.fontSize.lg, color: Colors.text, fontWeight: '800', lineHeight: Typography.fontSize.lg * 1.3 },
  verdictChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.md },
  verdictChip: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  verdictChipUrgent: { backgroundColor: Colors.brightRed, borderColor: Colors.brightRed },
  verdictChipText: { fontSize: Typography.fontSize.xs, color: Colors.text, fontWeight: '700', letterSpacing: 0.5 },

  actionList: { marginTop: Spacing.sm, gap: Spacing.xs },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: BorderRadius.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,0,54,0.25)' },
  actionDotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brightRed },
  actionTitle: { color: Colors.text, fontSize: Typography.fontSize.base, fontWeight: '700' },
  actionMetaRed: { color: Colors.brightRed, fontSize: Typography.fontSize.xs, fontWeight: '700', letterSpacing: 0.5, marginTop: 1 },
  didItBtn: { backgroundColor: Colors.pickleLime, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  didItText: { color: Colors.inkBlack, fontSize: Typography.fontSize.xs, fontWeight: '900', letterSpacing: 0.5 },
  nahBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  nahText: { color: Colors.textSubtle, fontSize: Typography.fontSize.xs, fontWeight: '800' },

  p3: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.xl, padding: Layout.cardPadding, marginBottom: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  p3Hero: { backgroundColor: Colors.pickleLime, borderColor: Colors.pickleLime },
  p3Done: { opacity: 0.5 },
  p3Num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  p3NumHero: { backgroundColor: 'rgba(13,13,13,0.2)', borderColor: 'rgba(13,13,13,0.3)' },
  p3NumDone: { backgroundColor: Colors.pickleLime, borderColor: Colors.pickleLime },
  p3NumText: { fontSize: Typography.fontSize.md, fontWeight: '900', color: Colors.text },
  p3Text: { flex: 1, fontSize: Typography.fontSize.md, fontWeight: '700', color: Colors.text },
  p3TextDone: { textDecorationLine: 'line-through', color: Colors.textSubtle, fontWeight: '500' },

  timeline: { marginTop: Spacing.sm, marginBottom: Spacing.sm },
  tlRow: { flexDirection: 'row', alignItems: 'flex-start' },
  tlTime: { width: 52, fontSize: Typography.fontSize.xs, color: Colors.pickleLime, fontWeight: '800', letterSpacing: 0.5, paddingTop: 14 },
  tlLineCol: { width: 18, alignItems: 'center', alignSelf: 'stretch', paddingTop: 14 },
  tlDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.pickleLime, borderWidth: 2, borderColor: Colors.background },
  tlLine: { flex: 1, width: 0, borderLeftWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', marginTop: 2 },
  tlCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tlCardTitle: { color: Colors.text, fontSize: Typography.fontSize.base, fontWeight: '700' },
  tlCardSub: { color: Colors.textSubtle, fontSize: Typography.fontSize.xs, marginTop: 1 },

  loopCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginBottom: Spacing.sm },
  loopHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  loopMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  ring: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: Colors.steelBlueGrey, alignItems: 'center', justifyContent: 'center' },
  ringDone: { backgroundColor: Colors.pickleLime, borderColor: Colors.pickleLime },
  ringText: { fontSize: 10, fontWeight: '800', color: Colors.text },
  ringEmptyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.steelBlueGrey },
  loopTitle: { flexShrink: 1, color: Colors.text, fontSize: Typography.fontSize.base, fontWeight: '700' },
  loopPreview: { color: Colors.textSubtle, fontSize: Typography.fontSize.xs, marginTop: 1 },
  loopSteps: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, paddingLeft: 58, gap: 6 },
  loopStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loopStepText: { fontSize: Typography.fontSize.sm, color: Colors.text },
  loopEdit: { fontSize: Typography.fontSize.xs, color: Colors.brightRed, fontWeight: '800', letterSpacing: 1, marginTop: 4 },

  loopsHeaderBtns: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkRepeatsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.softSpiceLilac,
  },
  checkRepeatsText: { color: Colors.softSpiceLilac, fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 1 },
  dedupeCard: {
    backgroundColor: 'rgba(124,107,166,0.12)',
    borderWidth: 1, borderColor: Colors.softSpiceLilac,
    borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  dedupeLabel: { fontSize: Typography.fontSize.xs, color: Colors.softSpiceLilac, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  dedupeReason: { fontSize: Typography.fontSize.sm, color: Colors.text, marginBottom: Spacing.sm, fontStyle: 'italic' },
  dedupeItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  dedupeItemText: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.textSubtle },
  dedupeActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },

  nnToggle: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.brightRed,
    marginBottom: Layout.componentGap,
  },
  nnToggleOn: { backgroundColor: Colors.brightRed, borderColor: Colors.brightRed },
  nnToggleLabel: { fontSize: Typography.fontSize.sm, color: Colors.text, fontWeight: '800', letterSpacing: 1 },
  nnToggleHint: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, marginTop: 1 },
  loopCardNN: { borderColor: Colors.brightRed, backgroundColor: 'rgba(255,0,54,0.06)' },
  loopTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  organizeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.pickleLime, borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md, marginTop: Spacing.md,
  },
  organizeText: { color: Colors.inkBlack, fontSize: Typography.fontSize.sm, fontWeight: '900', letterSpacing: 1 },
  kindRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Layout.componentGap },
  kindBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: Spacing.sm, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  kindBtnOn: { backgroundColor: Colors.softSpiceLilac, borderColor: Colors.softSpiceLilac },
  kindBtnText: { color: Colors.textSubtle, fontSize: Typography.fontSize.xs, fontWeight: '800', letterSpacing: 1 },
  tlDotAppt: { backgroundColor: Colors.softSpiceLilac },
  tlCardAppt: { borderColor: Colors.softSpiceLilac, backgroundColor: 'rgba(124,107,166,0.1)' },

  planSheet: { marginTop: 'auto', backgroundColor: Colors.charcoal, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Layout.cardPaddingLarge, maxHeight: '90%' },
  planDate: { fontSize: Typography.fontSize.xs, color: Colors.pickleLime, fontWeight: '800', letterSpacing: 1, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 4 },
  planItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 6 },
  planTime: { width: 48, fontSize: Typography.fontSize.xs, color: Colors.softSpiceLilac, fontWeight: '800' },
  planItemTitle: { fontSize: Typography.fontSize.base, color: Colors.text, fontWeight: '700' },
  planReason: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, marginTop: 1 },
  planClarify: { backgroundColor: 'rgba(124,107,166,0.12)', borderWidth: 1, borderColor: Colors.softSpiceLilac, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.xs },
  planClarifyQ: { fontSize: Typography.fontSize.sm, color: Colors.text, fontWeight: '700' },
  planClarifyT: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontStyle: 'italic', marginTop: 2 },
});
