import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout, Spacing, BorderRadius } from '../src/theme';
import { Card } from '../src/components/Card';
import { Input } from '../src/components/Input';
import { Button } from '../src/components/Button';
import { useAppStore } from '../src/store/appStore';
import {
  ensurePermissions,
  registerDevicePush,
  scheduleDailyReminders,
  cancelAllReminders,
} from '../src/utils/notifications';
import apiClient from '../src/services/api';
import { logoutAccount } from '../src/services/auth';

type Spice = 'mild' | 'medium' | 'extra_spicy';

const SPICE_OPTIONS: { value: Spice; label: string; sub: string; emoji: string }[] = [
  { value: 'mild', label: 'MILD', sub: 'Warm. Direct. Less sass.', emoji: '○' },
  { value: 'medium', label: 'MEDIUM', sub: 'Balanced. Brand voice.', emoji: '◐' },
  { value: 'extra_spicy', label: 'EXTRA SPICY', sub: 'Max chaos energy.', emoji: '●' },
];

function formatTime(h: number, m: number) {
  const hh = h.toString().padStart(2, '0');
  const mm = m.toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function bumpTime(h: number, m: number, deltaMinutes: number): { h: number; m: number } {
  const total = (h * 60 + m + deltaMinutes + 24 * 60) % (24 * 60);
  return { h: Math.floor(total / 60), m: total % 60 };
}

export default function SettingsScreen() {
  const router = useRouter();
  const {
    pepperSpiceLevel,
    setPepperSpiceLevel,
    nickname,
    setNickname,
    notifications,
    setNotifications,
    resetOnboarding,
    currentUserId,
    logout,
  } = useAppStore();

  const [draftNickname, setDraftNickname] = useState(nickname);

  useEffect(() => {
    setDraftNickname(nickname);
  }, [nickname]);

  const onChangeSpice = (level: Spice) => {
    setPepperSpiceLevel(level);
  };

  const onSaveNickname = () => {
    setNickname(draftNickname.trim());
    Alert.alert('Saved', 'PEPPER will use your name now.');
  };

  const applyReminders = async (next: typeof notifications) => {
    if (!next.enabled) {
      await cancelAllReminders();
      return;
    }
    const ok = await ensurePermissions();
    if (!ok) {
      Alert.alert(
        'Notifications blocked',
        'Enable notifications in Settings to get morning/evening check-ins.',
        [
          { text: 'Cancel', style: 'cancel' },
          ...(Platform.OS !== 'web' ? [{ text: 'Open Settings', onPress: () => {} }] : []),
        ]
      );
      // Roll back
      setNotifications({ enabled: false });
      return;
    }
    await registerDevicePush(currentUserId);
    await scheduleDailyReminders({
      morningEnabled: next.morning_enabled,
      morning: { hour: next.morning_hour, minute: next.morning_minute },
      eveningEnabled: next.evening_enabled,
      evening: { hour: next.evening_hour, minute: next.evening_minute },
    });
  };

  const toggleNotifications = async (val: boolean) => {
    setNotifications({ enabled: val });
    await applyReminders({ ...notifications, enabled: val });
  };

  const toggleMorning = async (val: boolean) => {
    const next = { ...notifications, morning_enabled: val };
    setNotifications({ morning_enabled: val });
    if (notifications.enabled) await applyReminders(next);
  };

  const toggleEvening = async (val: boolean) => {
    const next = { ...notifications, evening_enabled: val };
    setNotifications({ evening_enabled: val });
    if (notifications.enabled) await applyReminders(next);
  };

  const adjustTime = async (which: 'morning' | 'evening', delta: number) => {
    if (which === 'morning') {
      const { h, m } = bumpTime(notifications.morning_hour, notifications.morning_minute, delta);
      const next = { ...notifications, morning_hour: h, morning_minute: m };
      setNotifications({ morning_hour: h, morning_minute: m });
      if (notifications.enabled) await applyReminders(next);
    } else {
      const { h, m } = bumpTime(notifications.evening_hour, notifications.evening_minute, delta);
      const next = { ...notifications, evening_hour: h, evening_minute: m };
      setNotifications({ evening_hour: h, evening_minute: m });
      if (notifications.enabled) await applyReminders(next);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out?', 'You can log back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logoutAccount();
          logout();
          router.replace('/auth');
        },
      },
    ]);
  };

  const handleResetOnboarding = () => {
    Alert.alert(
      'Re-run onboarding?',
      'You\'ll see the intro again. Nothing else changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetOnboarding();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const handleWipeData = () => {
    Alert.alert(
      'Wipe everything?',
      'This deletes ALL your tasks, money, body notes, receipts, and PEPPER history. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe it all',
          style: 'destructive',
          onPress: async () => {
            try {
              const [tasks, projects, money, body, notes, history] = await Promise.all([
                apiClient.get(`/tasks/${currentUserId}`),
                apiClient.get(`/projects/${currentUserId}`),
                apiClient.get(`/money-entries/${currentUserId}`),
                apiClient.get(`/body-logs/${currentUserId}`),
                apiClient.get(`/person-notes/${currentUserId}`),
                apiClient.get(`/pepper/history/${currentUserId}`),
              ]);
              await Promise.all([
                ...tasks.data.map((t: any) => apiClient.delete(`/tasks/${t.id}`).catch(() => null)),
                ...projects.data.map((p: any) => apiClient.delete(`/projects/${p.id}`).catch(() => null)),
                ...notes.data.map((n: any) => apiClient.delete(`/person-notes/${n.id}`).catch(() => null)),
              ]);
              Alert.alert('Wiped', 'Fresh start. Go talk to PEPPER.');
            } catch (e) {
              Alert.alert('Hiccup', 'Some data couldn\'t be wiped. Try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'SETTINGS',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Profile */}
        <Text style={styles.sectionLabel}>PROFILE</Text>
        <Card variant="default">
          <Input
            label="WHAT SHOULD PEPPER CALL YOU?"
            value={draftNickname}
            onChangeText={setDraftNickname}
            placeholder="Nickname (optional)"
            testID="settings-nickname-input"
          />
          <Button
            title="SAVE NAME"
            onPress={onSaveNickname}
            variant="secondary"
            disabled={draftNickname === nickname}
          />
        </Card>

        {/* PEPPER Spice Level */}
        <Text style={styles.sectionLabel}>PEPPER SPICE LEVEL</Text>
        <Text style={styles.sectionHint}>How salty should she be?</Text>
        {SPICE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChangeSpice(opt.value)}
            testID={`spice-${opt.value}`}
          >
            <Card
              variant={pepperSpiceLevel === opt.value ? 'pepper' : 'default'}
              style={styles.spiceOption}
            >
              <View style={styles.spiceRow}>
                <Text
                  style={[
                    styles.spiceEmoji,
                    pepperSpiceLevel === opt.value && styles.spiceEmojiActive,
                  ]}
                >
                  {opt.emoji}
                </Text>
                <View style={styles.spiceTextWrap}>
                  <Text style={styles.spiceLabel}>{opt.label}</Text>
                  <Text style={styles.spiceSub}>{opt.sub}</Text>
                </View>
                {pepperSpiceLevel === opt.value && (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.pepperRed} />
                )}
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {/* Notifications */}
        <Text style={styles.sectionLabel}>CHECK-IN REMINDERS</Text>
        <Card variant="default">
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleLabel}>Daily reminders</Text>
              <Text style={styles.toggleSub}>
                {Platform.OS === 'web'
                  ? 'Works on iOS/Android only'
                  : 'Morning + evening check-ins'}
              </Text>
            </View>
            <Switch
              value={notifications.enabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: Colors.steelBlueGrey, true: Colors.pepperRed }}
              thumbColor={Colors.saltBone}
              testID="notif-master-switch"
            />
          </View>

          {notifications.enabled && (
            <>
              <View style={styles.divider} />

              {/* Morning */}
              <View style={styles.timeBlock}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextWrap}>
                    <Text style={styles.toggleLabel}>Morning check-in</Text>
                    <Text style={styles.toggleSub}>"New day, same chaos."</Text>
                  </View>
                  <Switch
                    value={notifications.morning_enabled}
                    onValueChange={toggleMorning}
                    trackColor={{ false: Colors.steelBlueGrey, true: Colors.pickleLime }}
                    thumbColor={Colors.saltBone}
                  />
                </View>
                {notifications.morning_enabled && (
                  <View style={styles.timeRow}>
                    <TouchableOpacity
                      style={styles.timeBump}
                      onPress={() => adjustTime('morning', -30)}
                    >
                      <Ionicons name="remove" size={20} color={Colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.timeText}>
                      {formatTime(notifications.morning_hour, notifications.morning_minute)}
                    </Text>
                    <TouchableOpacity
                      style={styles.timeBump}
                      onPress={() => adjustTime('morning', 30)}
                    >
                      <Ionicons name="add" size={20} color={Colors.text} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.divider} />

              {/* Evening */}
              <View style={styles.timeBlock}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextWrap}>
                    <Text style={styles.toggleLabel}>Evening check-in</Text>
                    <Text style={styles.toggleSub}>"How'd the floor hold?"</Text>
                  </View>
                  <Switch
                    value={notifications.evening_enabled}
                    onValueChange={toggleEvening}
                    trackColor={{ false: Colors.steelBlueGrey, true: Colors.pickleLime }}
                    thumbColor={Colors.saltBone}
                  />
                </View>
                {notifications.evening_enabled && (
                  <View style={styles.timeRow}>
                    <TouchableOpacity
                      style={styles.timeBump}
                      onPress={() => adjustTime('evening', -30)}
                    >
                      <Ionicons name="remove" size={20} color={Colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.timeText}>
                      {formatTime(notifications.evening_hour, notifications.evening_minute)}
                    </Text>
                    <TouchableOpacity
                      style={styles.timeBump}
                      onPress={() => adjustTime('evening', 30)}
                    >
                      <Ionicons name="add" size={20} color={Colors.text} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <Text style={styles.hintText}>
                Push only works on real devices after publishing & generating a build.
              </Text>
            </>
          )}
        </Card>

        {/* Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <Card variant="default">
          <TouchableOpacity style={styles.dangerRow} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.text} />
            <View style={styles.dangerTextWrap}>
              <Text style={styles.dangerLabel}>Log out</Text>
              <Text style={styles.dangerSub}>Sign out on this device.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.steelBlueGrey} />
          </TouchableOpacity>
        </Card>

        {/* Danger Zone */}
        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <Card variant="default">
          <TouchableOpacity style={styles.dangerRow} onPress={handleResetOnboarding}>
            <Ionicons name="refresh" size={20} color={Colors.softSpiceLilac} />
            <View style={styles.dangerTextWrap}>
              <Text style={styles.dangerLabel}>Reset onboarding</Text>
              <Text style={styles.dangerSub}>See the intro screens again.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.steelBlueGrey} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.dangerRow} onPress={handleWipeData}>
            <Ionicons name="trash" size={20} color={Colors.brightRed} />
            <View style={styles.dangerTextWrap}>
              <Text style={[styles.dangerLabel, styles.dangerLabelRed]}>Wipe all my data</Text>
              <Text style={styles.dangerSub}>Permanent. No undo.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.steelBlueGrey} />
          </TouchableOpacity>
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Salt Check v1.0</Text>
          <Text style={styles.footerSub}>by saltylabz · managed by PEPPER</Text>
        </View>
      </ScrollView>
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
  sectionLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.pepperRed,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sectionHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
    marginBottom: Spacing.md,
  },
  spiceOption: {
    marginBottom: Spacing.sm,
  },
  spiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spiceEmoji: {
    fontSize: 24,
    color: Colors.steelBlueGrey,
    marginRight: Spacing.md,
    width: 32,
    textAlign: 'center',
  },
  spiceEmojiActive: {
    color: Colors.pepperRed,
  },
  spiceTextWrap: {
    flex: 1,
  },
  spiceLabel: {
    fontSize: Typography.fontSize.md,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 1,
    marginBottom: 2,
  },
  spiceSub: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: Typography.fontSize.md,
    color: Colors.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleSub: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  timeBlock: {
    paddingVertical: Spacing.xs,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
  timeBump: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.charcoal,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: 2,
    minWidth: 90,
    textAlign: 'center',
  },
  hintText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  dangerTextWrap: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  dangerLabel: {
    fontSize: Typography.fontSize.md,
    color: Colors.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  dangerLabelRed: {
    color: Colors.brightRed,
  },
  dangerSub: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
  },
  footer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.steelBlueGrey,
    fontWeight: '600',
  },
  footerSub: {
    fontSize: Typography.fontSize.xs,
    color: Colors.steelBlueGrey,
    marginTop: 2,
    opacity: 0.6,
  },
});
