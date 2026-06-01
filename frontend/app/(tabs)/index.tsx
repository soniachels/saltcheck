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

export default function TodayScreen() {
  const { currentUserId, nickname } = useAppStore();
  const [todayEntry, setTodayEntry] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskForm, setTaskForm] = useState({ title: '', next_action: '', deadline: '' });

  const today = new Date().toISOString().split('T')[0];
  const todayDate = new Date();
  const dayName = todayDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const monthDay = todayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
    const payload = { ...task, status: next };
    delete payload.id;
    delete payload.user_id;
    delete payload.created_at;
    delete payload.updated_at;
    await apiClient.put(`/tasks/${task.id}`, payload);
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

        {/* Top 3 */}
        {todayEntry?.top_priorities && todayEntry.top_priorities.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>TOP 3.</Text>
            <Text style={styles.sectionHint}>not top 47.</Text>
            {todayEntry.top_priorities.slice(0, 3).map((p: string, i: number) => (
              <CategoryCard
                key={i}
                title={p}
                badge={`${i + 1}`}
                variant={i === 0 ? 'lime' : 'dark'}
              />
            ))}
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

        {activeTasks.length === 0 ? (
          <View style={styles.emptyLoops}>
            <Text style={styles.emptyText}>No loops. Clean kitchen.</Text>
          </View>
        ) : (
          activeTasks.map((task) => (
            <CategoryCard
              key={task.id}
              title={task.title}
              subtitle={task.next_action ? `→ ${task.next_action}` : task.deadline ? `due ${task.deadline}` : 'tap to update'}
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  editorScroll: { padding: Layout.screenPadding, paddingTop: 80 },
  editorCard: { backgroundColor: Colors.charcoal, borderRadius: BorderRadius.xl, padding: Layout.cardPaddingLarge },
  editorTitle: { fontSize: Typography.fontSize.xl, fontWeight: '900', color: Colors.text, letterSpacing: 1, marginBottom: Spacing.lg },
  editorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
});
