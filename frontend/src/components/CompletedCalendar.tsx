import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Layout } from '../theme';
import { Button } from './Button';

interface Props {
  visible: boolean;
  onClose: () => void;
  tasks: any[]; // all tasks; we read the done ones with completed_at
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function isoOf(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

export const CompletedCalendar: React.FC<Props> = ({ visible, onClose, tasks }) => {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);

  // date(YYYY-MM-DD) -> completed task titles
  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const t of tasks) {
      if (t.status !== 'done' || !t.completed_at) continue;
      const key = String(t.completed_at).slice(0, 10);
      (map[key] = map[key] || []).push(t);
    }
    return map;
  }, [tasks]);

  const monthPrefix = `${cursor.y}-${pad(cursor.m + 1)}`;
  const monthTotal = Object.keys(byDate)
    .filter((k) => k.startsWith(monthPrefix))
    .reduce((s, k) => s + byDate[k].length, 0);
  const activeDays = Object.keys(byDate).filter((k) => k.startsWith(monthPrefix)).length;

  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (delta: number) => {
    setSelected(null);
    let m = cursor.m + delta;
    let y = cursor.y;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setCursor({ y, m });
  };

  const selectedTasks = selected ? byDate[selected] || [] : [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>DONE CALENDAR</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={Colors.text} /></TouchableOpacity>
          </View>

          {/* Report strip */}
          <View style={styles.report}>
            <View style={styles.reportStat}><Text style={styles.reportNum}>{monthTotal}</Text><Text style={styles.reportLabel}>DONE</Text></View>
            <View style={styles.reportStat}><Text style={styles.reportNum}>{activeDays}</Text><Text style={styles.reportLabel}>ACTIVE DAYS</Text></View>
            <View style={styles.reportStat}><Text style={styles.reportNum}>{activeDays ? Math.round((monthTotal / activeDays) * 10) / 10 : 0}</Text><Text style={styles.reportLabel}>AVG/DAY</Text></View>
          </View>

          {/* Month nav */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => shiftMonth(-1)}><Ionicons name="chevron-back" size={22} color={Colors.text} /></TouchableOpacity>
            <Text style={styles.monthLabel}>{MONTHS[cursor.m]} {cursor.y}</Text>
            <TouchableOpacity onPress={() => shiftMonth(1)}><Ionicons name="chevron-forward" size={22} color={Colors.text} /></TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => <Text key={i} style={styles.weekday}>{w}</Text>)}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (d == null) return <View key={i} style={styles.cell} />;
              const iso = isoOf(cursor.y, cursor.m, d);
              const count = (byDate[iso] || []).length;
              const isSel = selected === iso;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.cell, count > 0 && styles.cellActive, isSel && styles.cellSelected]}
                  onPress={() => setSelected(count > 0 ? iso : null)}
                  disabled={count === 0}
                >
                  <Text style={[styles.cellDay, count > 0 && styles.cellDayActive]}>{d}</Text>
                  {count > 0 && <View style={styles.dot}><Text style={styles.dotText}>{count}</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Selected day detail */}
          {selected && (
            <ScrollView style={styles.detail}>
              <Text style={styles.detailTitle}>{selected} · {selectedTasks.length} done</Text>
              {selectedTasks.map((t, i) => (
                <View key={i} style={styles.detailRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.pickleLime} />
                  <Text style={styles.detailText}>{t.title}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Button title="DONE" onPress={onClose} variant="primary" style={{ marginTop: Spacing.md }} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  card: { marginTop: 'auto', backgroundColor: Colors.charcoal, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Layout.cardPaddingLarge, maxHeight: '88%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  title: { fontSize: Typography.fontSize.xl, fontWeight: '900', color: Colors.text, letterSpacing: 1 },
  report: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  reportStat: { flex: 1, backgroundColor: Colors.charcoalRaised, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center' },
  reportNum: { fontSize: Typography.fontSize.xl, fontWeight: '900', color: Colors.pickleLime },
  reportLabel: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  monthLabel: { fontSize: Typography.fontSize.md, fontWeight: '800', color: Colors.text },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  cellActive: { },
  cellSelected: { },
  cellDay: { fontSize: Typography.fontSize.sm, color: Colors.textSubtle },
  cellDayActive: { color: Colors.text, fontWeight: '800' },
  dot: { marginTop: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.pickleLime, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dotText: { fontSize: 10, fontWeight: '800', color: Colors.inkBlack },
  detail: { maxHeight: 160, marginTop: Spacing.md },
  detailTitle: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm, letterSpacing: 0.5 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  detailText: { fontSize: Typography.fontSize.sm, color: Colors.textSubtle, flex: 1 },
});
