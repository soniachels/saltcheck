import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';

// Horizontal day planner strip. Shows a window of days around today; tapping a
// day selects it. Selected = accent-filled pill; today = outlined; others muted.

const DAYS_BEFORE = 2;   // how many past days to show
const DAYS_AFTER = 13;   // how many future days to show
const PILL_W = 54;
const PILL_GAP = 10;

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function iso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

interface Props {
  selected: string;            // YYYY-MM-DD
  today: string;               // YYYY-MM-DD
  onSelect: (date: string) => void;
  accent?: string;             // selected-pill fill (defaults to hot pink)
}

export const DateCarousel: React.FC<Props> = ({ selected, today, onSelect, accent }) => {
  const scrollRef = useRef<ScrollView>(null);
  const accentColor = accent || Colors.brightRed;

  const base = new Date(today + 'T00:00:00');
  const days = Array.from({ length: DAYS_BEFORE + DAYS_AFTER + 1 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() - DAYS_BEFORE + i);
    return d;
  });

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // start a touch before "today" so it reads as the anchor
      contentOffset={{ x: Math.max(0, (DAYS_BEFORE - 1) * (PILL_W + PILL_GAP)), y: 0 }}
    >
      {days.map((d) => {
        const ds = iso(d);
        const isSel = ds === selected;
        const isToday = ds === today;
        const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
        return (
          <TouchableOpacity
            key={ds}
            activeOpacity={0.8}
            onPress={() => onSelect(ds)}
            style={[
              styles.pill,
              isSel && { backgroundColor: accentColor, borderColor: accentColor },
              !isSel && isToday && styles.pillToday,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSel }}
            accessibilityLabel={`${weekday} ${d.getDate()}${isToday ? ', today' : ''}`}
          >
            <Text style={[styles.weekday, isSel && styles.textOnAccent]}>{weekday}</Text>
            <Text style={[styles.day, isSel && styles.textOnAccent]}>{d.getDate()}</Text>
            {isToday && <View style={[styles.dot, { backgroundColor: isSel ? Colors.inkBlack : accentColor }]} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: { gap: PILL_GAP, paddingVertical: Spacing.xs, paddingRight: Spacing.md },
  pill: {
    width: PILL_W,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xl,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  pillToday: { borderColor: Colors.brightRed },
  weekday: { fontSize: Typography.fontSize.xs, color: Colors.textSubtle, fontWeight: '700', letterSpacing: 1 },
  day: { fontSize: Typography.fontSize.lg, color: Colors.text, fontWeight: '800', marginTop: 2 },
  textOnAccent: { color: Colors.inkBlack },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
});
