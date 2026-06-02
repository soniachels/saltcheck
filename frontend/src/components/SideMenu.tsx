import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';

type MenuItem = {
  key: string;
  label: string;
  icon: any;
  path: string;
  variant: 'red' | 'lime' | 'lilac' | 'dark';
};

const MENU: MenuItem[] = [
  { key: 'today', label: 'TODAY', icon: 'today', path: '/(tabs)', variant: 'red' },
  { key: 'math', label: 'GIRL MATH', icon: 'calculator', path: '/(tabs)/girl-math', variant: 'lime' },
  { key: 'body', label: 'BODY', icon: 'heart', path: '/(tabs)/body', variant: 'lilac' },
  { key: 'receipts', label: 'RECEIPTS', icon: 'lock-closed', path: '/(tabs)/receipts-tab', variant: 'red' },
  { key: 'more', label: 'MORE', icon: 'menu', path: '/(tabs)/more', variant: 'dark' },
];

function matchActive(pathname: string, target: string) {
  if (target === '/(tabs)') return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index' || pathname === '/(tabs)/';
  return pathname.startsWith(target);
}

export const SideMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const slide = React.useRef(new Animated.Value(-260)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 0 : -260,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  const go = (path: string) => {
    setOpen(false);
    setTimeout(() => router.push(path as any), 80);
  };

  const variantColor = (v: MenuItem['variant']) =>
    v === 'lime' ? Colors.pickleLime : v === 'lilac' ? Colors.softSpiceLilac : v === 'red' ? Colors.brightRed : Colors.text;

  return (
    <>
      {/* Floating left pebble */}
      <TouchableOpacity
        style={styles.pebble}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        testID="side-menu-open"
      >
        <Ionicons name="menu" size={22} color={Colors.saltBone} />
      </TouchableOpacity>

      {/* Drawer */}
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Animated.View
            style={[styles.drawer, { transform: [{ translateX: slide }] }]}
            onStartShouldSetResponder={() => true}
          >
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left']}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>SALT CHECK</Text>
                <Text style={styles.drawerSub}>where to?</Text>
              </View>

              {MENU.map((m) => {
                const active = matchActive(pathname, m.path);
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => go(m.path)}
                    activeOpacity={0.85}
                    testID={`menu-${m.key}`}
                  >
                    <View
                      style={[
                        styles.iconWrap,
                        { borderColor: variantColor(m.variant) },
                        active && { backgroundColor: variantColor(m.variant) },
                      ]}
                    >
                      <Ionicons
                        name={m.icon}
                        size={20}
                        color={active ? Colors.inkBlack : variantColor(m.variant)}
                      />
                    </View>
                    <Text style={[styles.rowText, active && { color: variantColor(m.variant) }]}>
                      {m.label}
                    </Text>
                    {active && <View style={[styles.activeDot, { backgroundColor: variantColor(m.variant) }]} />}
                  </TouchableOpacity>
                );
              })}

              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setOpen(false)}
                testID="side-menu-close"
              >
                <Ionicons name="close" size={20} color={Colors.text} />
                <Text style={styles.closeText}>CLOSE</Text>
              </TouchableOpacity>
            </SafeAreaView>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  pebble: {
    position: 'absolute',
    left: 12,
    bottom: 96,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.charcoalRaised,
    borderWidth: 1,
    borderColor: Colors.brightRed,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 50,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
  },
  drawer: {
    width: 260,
    height: '100%',
    backgroundColor: Colors.charcoal,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  drawerHeader: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.md,
  },
  drawerTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 2,
  },
  drawerSub: {
    fontSize: Typography.fontSize.xs,
    color: Colors.brightRed,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    marginBottom: 4,
    gap: Spacing.md,
  },
  rowActive: {
    backgroundColor: Colors.charcoalRaised,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    fontSize: Typography.fontSize.md,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 2,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  closeText: {
    color: Colors.text,
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
