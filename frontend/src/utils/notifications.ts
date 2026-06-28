import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import apiClient from '../services/api';
import { Colors } from '../theme';

// Default handler — show banner + list + sound while app is foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const MORNING_ID_PREFIX = 'saltcheck-morning';
const EVENING_ID_PREFIX = 'saltcheck-evening';
const BILL_ID_PREFIX = 'saltcheck-bill';

const MORNING_TITLES = [
  'New day, same chaos.',
  'Mornin\'. Let\'s sort it.',
  'Coffee, then check.',
];
const MORNING_BODIES = [
  'Open the dump. PEPPER\'s up.',
  'Top 3, not top 47. Go.',
  'What actually matters today?',
];

const EVENING_TITLES = [
  'End-of-day check.',
  'Salt the day before bed.',
  'How\'d the floor hold?',
];
const EVENING_BODIES = [
  'What actually happened today?',
  'One thing for tomorrow. That\'s it.',
  'Park what you can\'t carry into bed.',
];

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function ensurePermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;
  if (Platform.OS === 'web') return false;

  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;

  if (status !== 'granted') {
    if (settings.canAskAgain === false) return false;
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    status = req.status;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Salt Check',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: Colors.pepperRed,
    });
  }

  return status === 'granted';
}

export async function registerDevicePush(userId: string): Promise<void> {
  if (!Device.isDevice) return;
  if (Platform.OS === 'web') return;
  try {
    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    if (!tokenResponse?.data) return;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await apiClient.post('/register-push', {
      user_id: userId,
      platform,
      device_token: tokenResponse.data,
    });
  } catch (e) {
    // Quietly skip in preview / Expo Go where native push isn't available
    console.log('[push] register skipped:', (e as Error).message);
  }
}

interface ReminderTime {
  hour: number;
  minute: number;
}

export async function scheduleDailyReminders(opts: {
  morningEnabled: boolean;
  morning: ReminderTime;
  eveningEnabled: boolean;
  evening: ReminderTime;
}): Promise<void> {
  // Wipe everything we scheduled
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (
      n.identifier.startsWith(MORNING_ID_PREFIX) ||
      n.identifier.startsWith(EVENING_ID_PREFIX)
    ) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  if (opts.morningEnabled) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${MORNING_ID_PREFIX}-${opts.morning.hour}-${opts.morning.minute}`,
      content: {
        title: pick(MORNING_TITLES),
        body: pick(MORNING_BODIES),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: opts.morning.hour,
        minute: opts.morning.minute,
      },
    });
  }

  if (opts.eveningEnabled) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${EVENING_ID_PREFIX}-${opts.evening.hour}-${opts.evening.minute}`,
      content: {
        title: pick(EVENING_TITLES),
        body: pick(EVENING_BODIES),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: opts.evening.hour,
        minute: opts.evening.minute,
      },
    });
  }
}

export async function cancelAllReminders() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (
      n.identifier.startsWith(MORNING_ID_PREFIX) ||
      n.identifier.startsWith(EVENING_ID_PREFIX)
    ) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

interface BillLike {
  label?: string;
  amount?: number;
  due_date?: string; // YYYY-MM-DD
  paid?: boolean;
}

/**
 * Schedule a local reminder for each unpaid, future-dated bill — one day before
 * its due date at 9am. Cancels + reschedules every time (call whenever bills
 * change), so paid/removed bills drop their reminders. No server required.
 */
export async function scheduleBillReminders(bills: BillLike[], currency: string = 'USD'): Promise<void> {
  if (Platform.OS === 'web') return;
  // Clear previous bill reminders first.
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(BILL_ID_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  const unpaid = (bills || []).filter((b) => !b.paid && !!b.due_date);
  if (!unpaid.length) return;
  if (!(await ensurePermissions())) return;

  const now = Date.now();
  let i = 0;
  for (const b of unpaid) {
    const remind = new Date(`${b.due_date}T09:00:00`); // 9am ON the due date...
    if (isNaN(remind.getTime())) continue;
    remind.setDate(remind.getDate() - 1); // ...then back up one day → 9am the day before
    if (remind.getTime() <= now) continue; // reminder time already passed
    const amt = b.amount != null ? `${currency} ${b.amount}` : '';
    await Notifications.scheduleNotificationAsync({
      identifier: `${BILL_ID_PREFIX}-${i++}`,
      content: {
        title: `💸 ${b.label || 'a bill'} due tomorrow`,
        body: amt
          ? `${amt} due ${b.due_date}. handle it before it handles you.`
          : `${b.label || 'a bill'} is due ${b.due_date}. don't let it pile up.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: remind },
    });
  }
}
