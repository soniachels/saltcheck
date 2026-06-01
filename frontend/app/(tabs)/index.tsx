import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { CategoryCard } from '../../src/components/CategoryCard';
import { PepperBubble } from '../../src/components/PepperBubble';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { DatePicker } from '../../src/components/DatePicker';
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
  const { currentUserId, nickname } = useAppStore();
  const [todayEntry, setTodayEntry] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskForm, setTaskForm] = useState({ title: '', next_action: '', deadline: '' });
  const [pepperReaction, setPepperReaction] = useState<string | null>(null);
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
        apiClient.get(`/daily-entries/${currentUserId}/${today}`).catch(() => ({ data: null })),
        apiClient.get(`/tasks/${currentUserId}`).catch(() => ({ data: [] })),
      ]);
      setTodayEntry(entryRes.data);
      setTasks(tasksRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(useCallback(() => { loadAll(); }, []));
  useEffect(() => { loadAll(); }, []);

  const toggleCheck = async (field: string, current: boolean) => {
    if (!todayEntry) {
      // Create a minimal entry first
      const created = await apiClient.post(
        `/daily-entries?user_id=${currentUserId}`,
        { date: today, [field]: !current }
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
      setTaskForm({ title: task.title, next_action: task.next_action || '', deadline: task.deadline || '' });
    } else {
      setEditingTask(null);
      setTaskForm({ title: '', next_action: '', deadline: '' });
    }
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
    if (!wasDone && nowDone) {
      setPepperReaction(loopDoneReaction());
    }
    loadAll();
  };

  const togglePriorityDone = async (i: number) => {
    if (!todayEntry) return;
    const priorities = todayEntry.top_priorities || [];
    const current: boolean[] = (todayEntry.priorities_done || []).slice();
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
    setPepperReaction("ok. moved it back to in-progress. set a real date this time.");
    loadAll();
  };

  const deleteTask = async (id: string) => {
    await apiClient.delete(`/tasks/${id}`);
    setTaskModal(false);
    loadAll();
  };

  const activeTasks = tasks.filter((t) => !t.parked && t.status !== 'done');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const parkedTasks = tasks.filter((t) => t.parked);

  // Deadline-aware bucketing
  const overdueTasks = activeTasks.filter(
    (t) => t.deadline && t.deadline < today
  );
  const dueTodayTasks = activeTasks.filter((t) => t.deadline === today);
  const otherActiveTasks = activeTasks.filter(
    (t) => !t.deadline || t.deadline > today
  );

  // Priority completion state
  const priorities: string[] = todayEntry?.top_priorities || [];
  const prioritiesDone: boolean[] = todayEntry?.priorities_done || [];
  const allTopDone =
    priorities.length > 0 &&
    priorities.every((_, i) => !!prioritiesDone[i]);

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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={[styles.dateLabel, { color: accentColor }]}>
            {dayName} · {monthDay.toUpperCase()}
          </Text>
          <Text style={[styles.moodLabel, { color: accentColor }]}>{greeting.mood}</Text>
          <Text style={styles.heroTitle}>{heroGreeting}</Text>
          <Text style={styles.heroSub}>{greeting.vibe}</Text>
        </View>

        {/* Floating PEPPER reaction */}
        {pepperReaction && (
          <PepperBubble label="* PEPPER" variant="red" small style={{ marginBottom: Spacing.md }}>
            {pepperReaction}
          </PepperBubble>
        )}

        {/* Next Sane Step (if PEPPER's been here) */}
        {todayEntry?.next_sane_step && (
          <CategoryCard
            title={todayEntry.next_sane_step}
            subtitle="NEXT SANE STEP"
            icon="flame"
            variant="red"
            large
          />
        )}

        {/* Top 3 — now checkable */}
        {priorities.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>TOP 3.</Text>
            <Text style={styles.sectionHint}>not top 47. tap to close one.</Text>
            {priorities.slice(0, 3).map((p: string, i: number) => {
              const done = !!prioritiesDone[i];
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.priorityCard,
                    done && styles.priorityCardDone,
                    !done && i === 0 && styles.priorityCardLime,
                  ]}
                  onPress={() => togglePriorityDone(i)}
                  activeOpacity={0.85}
                  testID={`priority-${i}`}
                >
                  <View
                    style={[
                      styles.priorityCheckbox,
                      done && styles.priorityCheckboxDone,
                    ]}
                  >
                    {done ? (
                      <Ionicons name="checkmark" size={18} color={Colors.inkBlack} />
                    ) : (
                      <Text style={[
                        styles.priorityNum,
                        i === 0 && { color: Colors.inkBlack },
                      ]}>{i + 1}</Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.priorityText,
                      i === 0 && !done && { color: Colors.inkBlack },
                      done && styles.priorityTextDone,
                    ]}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {allTopDone && (
              <PepperBubble label="* PEPPER" variant="lime" style={{ marginTop: Spacing.sm }}>
                TOP 3 DONE. now go drink water and log off.
              </PepperBubble>
            )}
          </>
        )}

        {/* PEPPER overdue nudge */}
        {overdueTasks.length > 0 && (
          <View style={styles.nudgeWrap}>
            <PepperBubble label="* PEPPER" variant="red">
              {loopOverdueNudge(overdueNudgeSeed)} {overdueTasks.length === 1
                ? `"${overdueTasks[0].title}" was due ${overdueTasks[0].deadline}.`
                : `${overdueTasks.length} loops are past due.`}
            </PepperBubble>
            {overdueTasks.slice(0, 3).map((t) => (
              <View key={t.id} style={styles.nudgeRow}>
                <View style={styles.nudgeTextWrap}>
                  <Text style={styles.nudgeTitle}>{t.title}</Text>
                  <Text style={styles.nudgeMeta}>due {t.deadline}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.nudgeBtn, styles.nudgeBtnYes]}
                  onPress={() => markLoopDone(t)}
                >
                  <Text style={styles.nudgeBtnYesText}>DID IT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nudgeBtn, styles.nudgeBtnNo]}
                  onPress={() => reopenLoop(t)}
                >
                  <Text style={styles.nudgeBtnNoText}>NAH</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Due today */}
        {dueTodayTasks.length > 0 && (
          <View style={styles.nudgeWrap}>
            <PepperBubble label="* PEPPER" variant="lilac">
              {loopDueTodayNudge(overdueNudgeSeed)} {dueTodayTasks.length === 1
                ? `"${dueTodayTasks[0].title}".`
                : `${dueTodayTasks.length} things on the clock.`}
            </PepperBubble>
            {dueTodayTasks.map((t) => (
              <View key={t.id} style={styles.nudgeRow}>
                <View style={styles.nudgeTextWrap}>
                  <Text style={styles.nudgeTitle}>{t.title}</Text>
                  <Text style={styles.nudgeMeta}>due today</Text>
                </View>
                <TouchableOpacity
                  style={[styles.nudgeBtn, styles.nudgeBtnYes]}
                  onPress={() => markLoopDone(t)}
                >
                  <Text style={styles.nudgeBtnYesText}>DID IT</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
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

        {/* Open Loops (merged) */}
        <View style={styles.loopsHeader}>
          <Text style={styles.sectionLabel}>OPEN LOOPS.</Text>
          <TouchableOpacity onPress={() => openTaskEditor()} testID="add-loop-btn">
            <View style={styles.addLoopBtn}>
              <Ionicons name="add" size={18} color={Colors.saltBone} />
              <Text style={styles.addLoopText}>NEW LOOP</Text>
            </View>
          </TouchableOpacity>
        </View>

        {otherActiveTasks.length === 0 && activeTasks.length === 0 ? (
          <View style={styles.emptyLoops}>
            <Text style={styles.emptyText}>No loops. Clean kitchen.</Text>
          </View>
        ) : otherActiveTasks.length === 0 ? (
          <Text style={[styles.sectionHint, { marginBottom: Spacing.md }]}>
            (everything above is on the clock)
          </Text>
        ) : (
          otherActiveTasks.map((task) => (
            <CategoryCard
              key={task.id}
              title={task.title}
              subtitle={
                task.next_action
                  ? `→ ${task.next_action}`
                  : task.deadline
                  ? `due ${task.deadline}`
                  : 'tap to update'
              }
              variant="dark"
              onPress={() => openTaskEditor(task)}
              rightSlot={
                <TouchableOpacity onPress={() => cycleStatus(task)} style={styles.statusChip}>
                  <Text style={styles.statusChipText}>
                    {task.status === 'in_progress' ? '◐' : task.status === 'waiting' ? '◑' : '○'}
                  </Text>
                </TouchableOpacity>
              }
            />
          ))
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
          </>
        )}

        {!todayEntry && (
          <PepperBubble label="* PEPPER" variant="red" style={{ marginTop: Spacing.lg }}>
            No plan yet. Tap the flame to dump and I'll sort it.
          </PepperBubble>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

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
  editorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
});
