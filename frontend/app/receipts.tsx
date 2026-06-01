import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../src/theme';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../src/services/api';
import { useAppStore } from '../src/store/appStore';

export default function ReceiptsScreen() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<any>(null);
  const [formData, setFormData] = useState({
    person_name: '',
    relationship_context: '',
    promised: '',
    asked_for: '',
    do_not_reveal: '',
    follow_up_needed: '',
    risk_trust_notes: '',
  });
  const { currentUserId, receiptsUnlocked, setReceiptsUnlocked } = useAppStore();

  useEffect(() => {
    if (receiptsUnlocked) {
      setIsUnlocked(true);
      loadReceipts();
    }
  }, [receiptsUnlocked]);

  const authenticate = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Receipts',
          fallbackLabel: 'Use passcode',
        });

        if (result.success) {
          setIsUnlocked(true);
          setReceiptsUnlocked(true);
          loadReceipts();
        }
      } else {
        // No biometrics available, allow access (MVP)
        Alert.alert('Notice', 'Biometric security not available. Receipts will be accessible without authentication in this MVP version.');
        setIsUnlocked(true);
        setReceiptsUnlocked(true);
        loadReceipts();
      }
    } catch (error) {
      console.error('Auth error:', error);
    }
  };

  const loadReceipts = async () => {
    try {
      const response = await apiClient.get(`/person-notes/${currentUserId}`);
      setReceipts(response.data);
    } catch (error) {
      console.error('Failed to load receipts:', error);
    }
  };

  const saveReceipt = async () => {
    try {
      const data = {
        person_name: formData.person_name,
        relationship_context: formData.relationship_context || null,
        promised: formData.promised || null,
        asked_for: formData.asked_for || null,
        do_not_reveal: formData.do_not_reveal || null,
        follow_up_needed: formData.follow_up_needed || null,
        risk_trust_notes: formData.risk_trust_notes || null,
        locked: true,
      };

      if (editingReceipt) {
        await apiClient.put(`/person-notes/${editingReceipt.id}`, data);
      } else {
        await apiClient.post(`/person-notes?user_id=${currentUserId}`, data);
      }
      
      setModalVisible(false);
      setFormData({
        person_name: '',
        relationship_context: '',
        promised: '',
        asked_for: '',
        do_not_reveal: '',
        follow_up_needed: '',
        risk_trust_notes: '',
      });
      setEditingReceipt(null);
      loadReceipts();
    } catch (error) {
      console.error('Failed to save receipt:', error);
    }
  };

  const deleteReceipt = async (id: string) => {
    Alert.alert(
      'Delete Receipt',
      'This will permanently delete this receipt. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/person-notes/${id}`);
              loadReceipts();
            } catch (error) {
              console.error('Failed to delete receipt:', error);
            }
          },
        },
      ]
    );
  };

  const openEditModal = (receipt: any) => {
    setEditingReceipt(receipt);
    setFormData({
      person_name: receipt.person_name,
      relationship_context: receipt.relationship_context || '',
      promised: receipt.promised || '',
      asked_for: receipt.asked_for || '',
      do_not_reveal: receipt.do_not_reveal || '',
      follow_up_needed: receipt.follow_up_needed || '',
      risk_trust_notes: receipt.risk_trust_notes || '',
    });
    setModalVisible(true);
  };

  if (!isUnlocked) {
    return (
      <>
        <Stack.Screen options={{ title: 'RECEIPTS', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text }} />
        <View style={styles.lockedContainer}>
          <View style={styles.lockedContent}>
            <Ionicons name="lock-closed" size={80} color={Colors.pepperRed} />
            <Text style={styles.lockedTitle}>RECEIPTS</Text>
            <Text style={styles.lockedSubtitle}>Private people and power notes</Text>
            <Text style={styles.lockedText}>Saved. Between us.</Text>
            <Button title="UNLOCK" onPress={authenticate} variant="primary" style={styles.unlockButton} />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'RECEIPTS', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text }} />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.subtitle}>Trust no one. Remember everything.</Text>
          </View>

          {receipts.length > 0 ? (
            receipts.map((receipt) => (
              <TouchableOpacity key={receipt.id} onPress={() => openEditModal(receipt)}>
                <Card variant="receipt">
                  <View style={styles.receiptHeader}>
                    <Text style={styles.personName}>{receipt.person_name}</Text>
                    <Ionicons name="lock-closed" size={16} color={Colors.steelBlueGrey} />
                  </View>
                  {receipt.relationship_context && (
                    <Text style={styles.context}>{receipt.relationship_context}</Text>
                  )}
                  {receipt.promised && (
                    <View style={styles.receiptItem}>
                      <Text style={styles.receiptLabel}>PROMISED:</Text>
                      <Text style={styles.receiptText}>{receipt.promised}</Text>
                    </View>
                  )}
                  {receipt.risk_trust_notes && (
                    <View style={styles.receiptItem}>
                      <Text style={styles.receiptLabel}>NOTES:</Text>
                      <Text style={styles.receiptText}>{receipt.risk_trust_notes}</Text>
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No receipts yet. Add one to remember.</Text>
            </View>
          )}

          <Button
            title="NEW RECEIPT"
            onPress={() => {
              setFormData({
                person_name: '',
                relationship_context: '',
                promised: '',
                asked_for: '',
                do_not_reveal: '',
                follow_up_needed: '',
                risk_trust_notes: '',
              });
              setEditingReceipt(null);
              setModalVisible(true);
            }}
            variant="primary"
            style={styles.addButton}
          />
        </ScrollView>

        {/* Add/Edit Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{editingReceipt ? 'EDIT RECEIPT' : 'NEW RECEIPT'}</Text>
                
                <Input
                  label="PERSON NAME"
                  value={formData.person_name}
                  onChangeText={(text) => setFormData({ ...formData, person_name: text })}
                  placeholder="Who is this about?"
                />
                
                <Input
                  label="RELATIONSHIP/CONTEXT"
                  value={formData.relationship_context}
                  onChangeText={(text) => setFormData({ ...formData, relationship_context: text })}
                  placeholder="Client, coworker, friend, etc."
                />
                
                <Input
                  label="WHAT THEY PROMISED"
                  value={formData.promised}
                  onChangeText={(text) => setFormData({ ...formData, promised: text })}
                  placeholder="What did they say they'd do?"
                  multiline
                />
                
                <Input
                  label="WHAT THEY ASKED FOR"
                  value={formData.asked_for}
                  onChangeText={(text) => setFormData({ ...formData, asked_for: text })}
                  placeholder="What do they want from you?"
                  multiline
                />
                
                <Input
                  label="DO NOT REVEAL"
                  value={formData.do_not_reveal}
                  onChangeText={(text) => setFormData({ ...formData, do_not_reveal: text })}
                  placeholder="Don't over-explain to this one"
                  multiline
                />
                
                <Input
                  label="FOLLOW UP NEEDED"
                  value={formData.follow_up_needed}
                  onChangeText={(text) => setFormData({ ...formData, follow_up_needed: text })}
                  placeholder="What needs checking?"
                  multiline
                />
                
                <Input
                  label="RISK/TRUST NOTES"
                  value={formData.risk_trust_notes}
                  onChangeText={(text) => setFormData({ ...formData, risk_trust_notes: text })}
                  placeholder="Red flags, green flags, vibes"
                  multiline
                />

                <View style={styles.modalButtons}>
                  <Button title="CANCEL" onPress={() => setModalVisible(false)} variant="ghost" />
                  <Button title="SAVE" onPress={saveReceipt} variant="primary" />
                  {editingReceipt && (
                    <Button
                      title="DELETE"
                      onPress={() => {
                        deleteReceipt(editingReceipt.id);
                        setModalVisible(false);
                      }}
                      variant="danger"
                    />
                  )}
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
  lockedContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.screenPadding,
  },
  lockedContent: {
    alignItems: 'center',
  },
  lockedTitle: {
    fontSize: Typography.fontSize.hero,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: Spacing.lg,
    letterSpacing: 2,
  },
  lockedSubtitle: {
    fontSize: Typography.fontSize.lg,
    color: Colors.steelBlueGrey,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  lockedText: {
    fontSize: Typography.fontSize.base,
    color: Colors.steelBlueGrey,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  unlockButton: {
    minWidth: 200,
  },
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
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  personName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  context: {
    fontSize: Typography.fontSize.sm,
    color: Colors.steelBlueGrey,
    marginBottom: Spacing.md,
  },
  receiptItem: {
    marginBottom: Spacing.sm,
  },
  receiptLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
    marginBottom: 2,
  },
  receiptText: {
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