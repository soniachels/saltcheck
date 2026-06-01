import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal } from 'react-native';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import apiClient from '../../src/services/api';
import { useAppStore } from '../../src/store/appStore';

export default function MoneyFloorScreen() {
  const [moneyEntry, setMoneyEntry] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    cash_available: '',
    expected_income: '',
    upcoming_bills: '',
    debts: '',
    urgent_payments: '',
    afford_note: '',
  });
  const { currentUserId } = useAppStore();

  useEffect(() => {
    loadMoneyEntry();
  }, []);

  const loadMoneyEntry = async () => {
    try {
      const response = await apiClient.get(`/money-entries/${currentUserId}`);
      if (response.data && response.data.length > 0) {
        const latest = response.data[0];
        setMoneyEntry(latest);
        setFormData({
          cash_available: latest.cash_available?.toString() || '',
          expected_income: latest.expected_income?.toString() || '',
          upcoming_bills: latest.upcoming_bills?.toString() || '',
          debts: latest.debts?.toString() || '',
          urgent_payments: latest.urgent_payments || '',
          afford_note: latest.afford_note || '',
        });
      }
    } catch (error) {
      console.error('Failed to load money entry:', error);
    }
  };

  const saveMoneyEntry = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = {
        date: today,
        cash_available: parseFloat(formData.cash_available) || null,
        expected_income: parseFloat(formData.expected_income) || null,
        upcoming_bills: parseFloat(formData.upcoming_bills) || null,
        debts: parseFloat(formData.debts) || null,
        urgent_payments: formData.urgent_payments || null,
        afford_note: formData.afford_note || null,
      };

      if (moneyEntry) {
        await apiClient.put(`/money-entries/${moneyEntry.id}`, data);
      } else {
        await apiClient.post(`/money-entries?user_id=${currentUserId}`, data);
      }
      
      setModalVisible(false);
      loadMoneyEntry();
    } catch (error) {
      console.error('Failed to save money entry:', error);
    }
  };

  const cashAvailable = moneyEntry?.cash_available || 0;
  const upcomingBills = moneyEntry?.upcoming_bills || 0;
  const actualFloor = cashAvailable - upcomingBills;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>Check the floor before the fantasy.</Text>
        </View>

        {/* The Floor */}
        <Card variant="money">
          <Text style={styles.sectionLabel}>THE FLOOR</Text>
          <Text style={styles.floorAmount}>${actualFloor.toFixed(2)}</Text>
          <Text style={styles.floorSubtext}>What's actually available right now</Text>
        </Card>

        {/* Breakdown */}
        <Card variant="default">
          <Text style={styles.sectionLabel}>BREAKDOWN</Text>
          
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Cash Available</Text>
            <Text style={styles.rowValue}>${cashAvailable.toFixed(2)}</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Upcoming Bills</Text>
            <Text style={[styles.rowValue, styles.negative]}>-${upcomingBills.toFixed(2)}</Text>
          </View>
          
          {moneyEntry?.debts && moneyEntry.debts > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Debts/Payments</Text>
                <Text style={[styles.rowValue, styles.negative]}>-${moneyEntry.debts.toFixed(2)}</Text>
              </View>
            </>
          )}
          
          {moneyEntry?.expected_income && moneyEntry.expected_income > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Expected Income</Text>
                <Text style={[styles.rowValue, styles.positive]}>+${moneyEntry.expected_income.toFixed(2)}</Text>
              </View>
            </>
          )}
        </Card>

        {/* Urgent Payments */}
        {moneyEntry?.urgent_payments && (
          <Card variant="default">
            <Text style={styles.sectionLabel}>URGENT</Text>
            <Text style={styles.urgentText}>{moneyEntry.urgent_payments}</Text>
          </Card>
        )}

        {/* Can I Afford This? */}
        {moneyEntry?.afford_note && (
          <Card variant="money">
            <Text style={styles.sectionLabel}>CAN I AFFORD THIS?</Text>
            <Text style={styles.affordText}>{moneyEntry.afford_note}</Text>
          </Card>
        )}

        {/* Edit Button */}
        <Button
          title={moneyEntry ? 'UPDATE MONEY FLOOR' : 'SET MONEY FLOOR'}
          onPress={() => setModalVisible(true)}
          variant="primary"
          style={styles.editButton}
        />
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>MONEY FLOOR</Text>
              
              <Input
                label="CASH AVAILABLE"
                value={formData.cash_available}
                onChangeText={(text) => setFormData({ ...formData, cash_available: text })}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              
              <Input
                label="EXPECTED INCOME"
                value={formData.expected_income}
                onChangeText={(text) => setFormData({ ...formData, expected_income: text })}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              
              <Input
                label="UPCOMING BILLS"
                value={formData.upcoming_bills}
                onChangeText={(text) => setFormData({ ...formData, upcoming_bills: text })}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              
              <Input
                label="DEBTS/REPAYMENTS"
                value={formData.debts}
                onChangeText={(text) => setFormData({ ...formData, debts: text })}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              
              <Input
                label="URGENT PAYMENTS"
                value={formData.urgent_payments}
                onChangeText={(text) => setFormData({ ...formData, urgent_payments: text })}
                placeholder="What needs paying now?"
                multiline
              />
              
              <Input
                label="CAN I AFFORD THIS?"
                value={formData.afford_note}
                onChangeText={(text) => setFormData({ ...formData, afford_note: text })}
                placeholder="Check before buying..."
                multiline
              />

              <View style={styles.modalButtons}>
                <Button title="CANCEL" onPress={() => setModalVisible(false)} variant="ghost" />
                <Button title="SAVE" onPress={saveMoneyEntry} variant="primary" />
              </View>
            </View>
          </ScrollView>
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
  sectionLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.pepperRed,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  floorAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.pickleLime,
    marginBottom: Spacing.xs,
  },
  floorSubtext: {
    fontSize: Typography.fontSize.sm,
    color: Colors.steelBlueGrey,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  rowLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  rowValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  positive: {
    color: Colors.pickleLime,
  },
  negative: {
    color: Colors.pepperRed,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  urgentText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: Typography.fontSize.base * 1.5,
  },
  affordText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: Typography.fontSize.base * 1.5,
  },
  editButton: {
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