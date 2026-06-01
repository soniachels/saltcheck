import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../src/theme';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import apiClient from '../src/services/api';
import { useAppStore } from '../src/store/appStore';

export default function BodyNotesScreen() {
  const [bodyLogs, setBodyLogs] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    sleep: '',
    appetite: '',
    symptoms: '',
    medication_note: '',
    water: '',
    notes: '',
  });
  const { currentUserId } = useAppStore();

  useEffect(() => {
    loadBodyLogs();
  }, []);

  const loadBodyLogs = async () => {
    try {
      const response = await apiClient.get(`/body-logs/${currentUserId}`);
      setBodyLogs(response.data);
    } catch (error) {
      console.error('Failed to load body logs:', error);
    }
  };

  const saveBodyLog = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = {
        date: today,
        sleep: formData.sleep || null,
        appetite: formData.appetite || null,
        symptoms: formData.symptoms || null,
        medication_note: formData.medication_note || null,
        water: formData.water ? parseInt(formData.water) : null,
        notes: formData.notes || null,
      };

      await apiClient.post(`/body-logs?user_id=${currentUserId}`, data);
      setModalVisible(false);
      setFormData({ sleep: '', appetite: '', symptoms: '', medication_note: '', water: '', notes: '' });
      loadBodyLogs();
    } catch (error) {
      console.error('Failed to save body log:', error);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'BODY NOTES', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text }} />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.subtitle}>Your body is not a side quest.</Text>
          </View>

          {bodyLogs.length > 0 ? (
            bodyLogs.map((log) => (
              <Card key={log.id} variant="body">
                <Text style={styles.date}>{log.date}</Text>
                {log.sleep && (
                  <View style={styles.logItem}>
                    <Text style={styles.logLabel}>Sleep:</Text>
                    <Text style={styles.logText}>{log.sleep}</Text>
                  </View>
                )}
                {log.appetite && (
                  <View style={styles.logItem}>
                    <Text style={styles.logLabel}>Appetite:</Text>
                    <Text style={styles.logText}>{log.appetite}</Text>
                  </View>
                )}
                {log.symptoms && (
                  <View style={styles.logItem}>
                    <Text style={styles.logLabel}>Symptoms:</Text>
                    <Text style={styles.logText}>{log.symptoms}</Text>
                  </View>
                )}
                {log.notes && (
                  <View style={styles.logItem}>
                    <Text style={styles.logLabel}>Notes:</Text>
                    <Text style={styles.logText}>{log.notes}</Text>
                  </View>
                )}
              </Card>
            ))
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No logs today. Tomorrow counts too.</Text>
            </View>
          )}

          <Button
            title="ADD BODY NOTE"
            onPress={() => setModalVisible(true)}
            variant="primary"
            style={styles.addButton}
          />
        </ScrollView>

        {/* Add Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>BODY NOTE</Text>
                
                <Input
                  label="SLEEP"
                  value={formData.sleep}
                  onChangeText={(text) => setFormData({ ...formData, sleep: text })}
                  placeholder="How did you sleep?"
                />
                
                <Input
                  label="APPETITE"
                  value={formData.appetite}
                  onChangeText={(text) => setFormData({ ...formData, appetite: text })}
                  placeholder="How's your appetite?"
                />
                
                <Input
                  label="SYMPTOMS"
                  value={formData.symptoms}
                  onChangeText={(text) => setFormData({ ...formData, symptoms: text })}
                  placeholder="Anything weird happening?"
                  multiline
                />
                
                <Input
                  label="MEDICATION/VITAMINS"
                  value={formData.medication_note}
                  onChangeText={(text) => setFormData({ ...formData, medication_note: text })}
                  placeholder="Did you take your meds?"
                />
                
                <Input
                  label="WATER (GLASSES)"
                  value={formData.water}
                  onChangeText={(text) => setFormData({ ...formData, water: text })}
                  keyboardType="number-pad"
                  placeholder="0"
                />
                
                <Input
                  label="NOTES"
                  value={formData.notes}
                  onChangeText={(text) => setFormData({ ...formData, notes: text })}
                  placeholder="Any other notes..."
                  multiline
                />

                <View style={styles.modalButtons}>
                  <Button title="CANCEL" onPress={() => setModalVisible(false)} variant="ghost" />
                  <Button title="SAVE" onPress={saveBodyLog} variant="primary" />
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
      </View>
    </>
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
  date: {
    fontSize: Typography.fontSize.sm,
    color: Colors.softSpiceLilac,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  logItem: {
    marginBottom: Spacing.sm,
  },
  logLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
    marginBottom: 2,
  },
  logText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  empty: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.steelBlueGrey,
    textAlign: 'center',
  },
  addButton: {
    marginTop: Spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  modalScroll: {
    padding: Layout.screenPadding,
    paddingTop: 60,
  },
  modalContent: {
    width: '100%',
    backgroundColor: Colors.charcoal,
    borderRadius: BorderRadius.lg,
    padding: Layout.cardPadding,
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