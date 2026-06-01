import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Layout } from '../theme';
import { Button } from './Button';

interface DatePickerProps {
  label?: string;
  value: string; // YYYY-MM-DD or empty
  onChange: (v: string) => void;
  placeholder?: string;
  testID?: string;
  variant?: 'lilac' | 'lime' | 'red' | 'dark';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function fmtIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtDisplay(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Tap-to-open calendar picker. No manual typing.
 */
export const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Pick a date',
  testID,
  variant = 'dark',
}) => {
  const [open, setOpen] = useState(false);
  const initial = value ? new Date(value) : new Date();
  const [viewMonth, setViewMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(value ? initial : null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const accent =
    variant === 'lime' ? Colors.pickleLime :
    variant === 'red' ? Colors.brightRed :
    Colors.softSpiceLilac;

  const handleSave = () => {
    if (selected) onChange(fmtIso(selected));
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        testID={testID}
      >
        <Ionicons name="calendar" size={20} color={accent} />
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {value ? fmtDisplay(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.steelBlueGrey} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.monthRow}>
              <TouchableOpacity
                onPress={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                style={styles.monthBtn}
              >
                <Ionicons name="chevron-back" size={22} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                style={styles.monthBtn}
              >
                <Ionicons name="chevron-forward" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((d, i) => (
                <Text key={i} style={styles.weekLabel}>{d}</Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day == null) return <View key={i} style={styles.cell} />;
                const cellDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
                const isToday = fmtIso(cellDate) === fmtIso(today);
                const isSelected = selected && fmtIso(selected) === fmtIso(cellDate);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.cell,
                      isToday && styles.cellToday,
                      isSelected && { backgroundColor: accent },
                    ]}
                    onPress={() => setSelected(cellDate)}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isSelected && { color: Colors.inkBlack, fontWeight: '900' },
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.quickRow}>
              <TouchableOpacity
                style={styles.quickPill}
                onPress={() => { setSelected(today); setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }}
              >
                <Text style={styles.quickText}>TODAY</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickPill}
                onPress={() => {
                  const tom = new Date(today);
                  tom.setDate(tom.getDate() + 1);
                  setSelected(tom);
                  setViewMonth(new Date(tom.getFullYear(), tom.getMonth(), 1));
                }}
              >
                <Text style={styles.quickText}>TOMORROW</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickPill}
                onPress={() => {
                  const wk = new Date(today);
                  wk.setDate(wk.getDate() + 7);
                  setSelected(wk);
                  setViewMonth(new Date(wk.getFullYear(), wk.getMonth(), 1));
                }}
              >
                <Text style={styles.quickText}>NEXT WEEK</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actions}>
              <Button title="CANCEL" onPress={() => setOpen(false)} variant="ghost" />
              <Button title="SET" onPress={handleSave} variant="primary" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.md },
  label: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trigger: {
    height: 52,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.charcoalRaised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  triggerText: { flex: 1, fontSize: Typography.fontSize.base, color: Colors.text, fontWeight: '600' },
  placeholder: { color: Colors.textSubtle, fontWeight: '400' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.charcoal,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingTop: 12,
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 32,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  monthBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.charcoalRaised, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: Colors.text, letterSpacing: 1 },
  weekRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  weekLabel: { flex: 1, textAlign: 'center', color: Colors.textSubtle, fontSize: Typography.fontSize.xs, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
  },
  cellToday: { borderWidth: 1, borderColor: Colors.brightRed },
  cellText: { color: Colors.text, fontSize: Typography.fontSize.base, fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.lg, marginBottom: Spacing.md },
  quickPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickText: { fontSize: Typography.fontSize.xs, color: Colors.text, fontWeight: '700', letterSpacing: 1 },
  actions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
});
