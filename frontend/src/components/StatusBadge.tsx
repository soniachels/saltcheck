import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';

type Status = 'not_started' | 'in_progress' | 'waiting' | 'done' | 'parked';

interface StatusBadgeProps {
  status: Status;
}

const statusConfig = {
  not_started: { label: 'NOT STARTED', color: Colors.steelBlueGrey },
  in_progress: { label: 'IN PROGRESS', color: Colors.pepperRed },
  waiting: { label: 'WAITING', color: Colors.steelBlueGrey },
  done: { label: 'DONE', color: Colors.pickleLime },
  parked: { label: 'PARKED', color: Colors.darkGreen },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = statusConfig[status];
  
  return (
    <View style={[styles.badge, { borderColor: config.color }]}>
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});