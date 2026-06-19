import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';

type MenuItem = {
  key: string;
  label: string;
  icon: any;
  path: string;
  variant: 'red' | 'lime' | 'lilac' | 'dark';
};

// EDIT HERE to change menu items (order = bottom→top; first item sits nearest
// the button). Each needs a label, an Ionicons icon name, a route path, and a
// color variant (red/lime/lilac/dark).
const MENU: MenuItem[] = [
  { key: 'today', label: 'Today', icon: 'today', path: '/(tabs)', variant: 'red' },
  { key: 'math', label: 'Girl Math', icon: 'calculator', path: '/(tabs)/girl-math', variant: 'lime' },
  { key: 'body', label: 'Body', icon: 'heart', path: '/(tabs)/body', variant: 'lilac' },
  { key: 'receipts', label: 'Receipts', icon: 'lock-closed', path: '/(tabs)/receipts-tab', variant: 'red' },
  { key: 'more', label: 'More', icon: 'menu', path: '/(tabs)/more', variant: 'dark' },
];

// Animation tuning
const STAGGER = 0.1; // fraction of the timeline between each item's start
const ITEM_WINDOW = 0.55; // how much of the timeline each item's motion spans
const DURATION = 340;

function matchActive(pathname: string, target: string) {
  if (target === '/(tabs)')
    return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index' || pathname === '/(tabs)/';
  return pathname.startsWith(target);
}

function variantColor(v: MenuItem['variant']) {
  return v === 'lime' ? Colors.pickleLime
    : v === 'lilac' ? Colors.softSpiceLilac
    : v === 'red' ? Colors.brightRed
    : Colors.text;
}

export const FloatingNav: React.FC = () => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const go = (path: string) => {
    setOpen(false);
    setTimeout(() => router.push(path as any), 90);
  };

  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <>
      {/* Tap-outside backdrop (only while open) */}
      {open && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close navigation menu"
        />
      )}

      {/* Expanding items — anchored just above the button, stacking upward */}
      <View style={styles.itemsWrap} pointerEvents={open ? 'box-none' : 'none'}>
        {MENU.map((m, i) => {
          const start = Math.min(i * STAGGER, 1 - ITEM_WINDOW);
          const t = progress.interpolate({
            inputRange: [start, Math.min(start + ITEM_WINDOW, 1)],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          });
          const active = matchActive(pathname, m.path);
          const color = variantColor(m.variant);
          return (
            <Animated.View
              key={m.key}
              pointerEvents={open ? 'auto' : 'none'}
              style={[
                styles.itemRow,
                {
                  opacity: t,
                  transform: [
                    { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                    { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                  ],
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.pill, active ? { backgroundColor: color } : styles.pillInactive]}
                onPress={() => go(m.path)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${m.label}${active ? ', current screen' : ''}`}
                testID={`nav-${m.key}`}
              >
                <View
                  style={[
                    styles.iconCircle,
                    active
                      ? { backgroundColor: Colors.inkBlack }
                      : { borderColor: color, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
                  ]}
                >
                  <Ionicons name={m.icon} size={18} color={active ? color : color} />
                </View>
                <Text style={[styles.pillLabel, active && { color: Colors.inkBlack }]}>{m.label}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      {/* Anchored bottom-left button */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Close navigation menu' : 'Open navigation menu'}
        testID="floating-nav-button"
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name={open ? 'close' : 'menu'} size={22} color={Colors.saltBone} />
        </Animated.View>
      </TouchableOpacity>
    </>
  );
};

const BUTTON_BOTTOM = 96;
const BUTTON_SIZE = 48;

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: 12,
    bottom: BUTTON_BOTTOM,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.brightRed,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.brightRed,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 60,
  },
  itemsWrap: {
    position: 'absolute',
    left: 12,
    bottom: BUTTON_BOTTOM + BUTTON_SIZE + 12,
    flexDirection: 'column-reverse', // first MENU item sits nearest the button
    alignItems: 'flex-start',
    gap: 10,
    zIndex: 59,
  },
  itemRow: {
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: Spacing.md,
    borderRadius: BorderRadius.full,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  pillInactive: {
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 1,
  },
});
