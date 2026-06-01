import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { StatusBadge } from '../../src/components/StatusBadge';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../src/services/api';
import { useAppStore } from '../../src/store/appStore';

export default function OpenLoopsScreen() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [newTask, setNewTask] = useState({ title: '', next_action: '', deadline: '', status: 'not_started' });
  const { currentUserId } = useAppStore();

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const response = await apiClient.get(`/tasks/${currentUserId}`);
      setTasks(response.data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const saveTask = async () => {
    try {
      if (editingTask) {
        await apiClient.put(`/tasks/${editingTask.id}`, newTask);
      } else {
        await apiClient.post(`/tasks?user_id=${currentUserId}`, newTask);
      }
      setModalVisible(false);
      setNewTask({ title: '', next_action: '', deadline: '', status: 'not_started' });
      setEditingTask(null);
      loadTasks();
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await apiClient.delete(`/tasks/${id}`);
      loadTasks();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const openEditModal = (task: any) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      next_action: task.next_action || '',
      deadline: task.deadline || '',
      status: task.status,
    });
    setModalVisible(true);
  };

  const activeTasks = tasks.filter(t => !t.parked && t.status !== 'done');
  const completedTasks = tasks.filter(t => t.status === 'done');
  const parkedTasks = tasks.filter(t => t.parked);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>What's the next actual move?</Text>
        </View>

        {/* Active Tasks */}
        {activeTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ACTIVE LOOPS</Text>
            {activeTasks.map((task) => (
              <Card key={task.id} variant="default">
                <TouchableOpacity onPress={() => openEditModal(task)}>
                  <View style={styles.taskHeader}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <StatusBadge status={task.status} />
                  </View>
                  {task.next_action && (
                    <Text style={styles.nextAction}>→ {task.next_action}</Text>
                  )}
                  {task.deadline && (
                    <Text style={styles.deadline}>Due: {task.deadline}</Text>
                  )}
                </TouchableOpacity>
              </Card>
            ))}
          </View>
        )}

        {/* Parked */}
        {parkedTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PARKED</Text>
            {parkedTasks.map((task) => (
              <Card key={task.id} variant="parked">
                <TouchableOpacity onPress={() => openEditModal(task)}>
                  <Text style={styles.parkedTitle}>{task.title}</Text>
                </TouchableOpacity>
              </Card>
            ))}
          </View>
        )}

        {/* Completed */}
        {completedTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DONE</Text>
            {completedTasks.map((task) => (
              <Card key={task.id} variant="default">
                <Text style={styles.doneTitle}>{task.title}</Text>
              </Card>
            ))}
          </View>
        )}

        {tasks.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No loops yet. Add one to start.</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setNewTask({ title: '', next_action: '', deadline: '', status: 'not_started' });
          setEditingTask(null);
          setModalVisible(true);
        }}
      >
        <Ionicons name="add" size={32} color={Colors.saltBone} />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingTask ? 'EDIT LOOP' : 'NEW LOOP'}</Text>
            
            <Input
              label="WHAT IS IT?"
              value={newTask.title}
              onChangeText={(text) => setNewTask({ ...newTask, title: text })}
              placeholder="Project or task name"
            />
            
            <Input
              label="NEXT ACTION"
              value={newTask.next_action}
              onChangeText={(text) => setNewTask({ ...newTask, next_action: text })}
              placeholder="What's the actual next move?"
            />
            
            <Input
              label="DEADLINE (OPTIONAL)"
              value={newTask.deadline}
              onChangeText={(text) => setNewTask({ ...newTask, deadline: text })}
              placeholder="YYYY-MM-DD"
            />

            <View style={styles.modalButtons}>
              <Button title="CANCEL" onPress={() => setModalVisible(false)} variant="ghost" />
              <Button title="SAVE" onPress={saveTask} variant="primary" />
              {editingTask && (
                <Button
                  title="DELETE"
                  onPress={() => {
                    deleteTask(editingTask.id);
                    setModalVisible(false);
                  }}
                  variant="danger"
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Layout.screenPadding,
    paddingBottom: 100,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.steelBlueGrey,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.pepperRed,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  taskTitle: {
    flex: 1,
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    marginRight: Spacing.sm,
  },
  nextAction: {
    fontSize: Typography.fontSize.base,
    color: Colors.pickleLime,
    marginBottom: Spacing.xs,
  },
  deadline: {
    fontSize: Typography.fontSize.sm,
    color: Colors.steelBlueGrey,
  },
  parkedTitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.steelBlueGrey,
  },
  doneTitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.steelBlueGrey,
    textDecorationLine: 'line-through',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.steelBlueGrey,
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: Layout.screenPadding,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.pepperRed,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.screenPadding,
  },
  modalContent: {
    width: '100%',
    backgroundColor: Colors.charcoal,
    borderRadius: BorderRadius.lg,
    padding: Layout.cardPadding,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.lg,
    letterSpacing: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
});