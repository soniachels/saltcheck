import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '../utils/storage';

interface User {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  pepper_spice_level: 'mild' | 'medium' | 'extra_spicy';
  timezone: string;
}

interface NotificationSettings {
  enabled: boolean;
  morning_enabled: boolean;
  morning_hour: number;
  morning_minute: number;
  evening_enabled: boolean;
  evening_hour: number;
  evening_minute: number;
}

interface AppState {
  user: User | null;
  currentUserId: string;
  isOnboarded: boolean;
  receiptsUnlocked: boolean;
  pepperSpiceLevel: 'mild' | 'medium' | 'extra_spicy';
  nickname: string;
  notifications: NotificationSettings;

  // Actions
  setUser: (user: User | null) => void;
  setAuthUser: (user: User) => void;
  setCurrentUserId: (id: string) => void;
  setIsOnboarded: (value: boolean) => void;
  setReceiptsUnlocked: (value: boolean) => void;
  setPepperSpiceLevel: (level: 'mild' | 'medium' | 'extra_spicy') => void;
  setNickname: (n: string) => void;
  setNotifications: (n: Partial<NotificationSettings>) => void;
  resetOnboarding: () => void;
  logout: () => void;
}

// Bridge our `storage` util to Zustand's persist API.
// SSR-safe: skip during server render — re-hydration happens client-side.
const isBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined';

const zustandStorage = {
  getItem: async (name: string) => {
    if (!isBrowser) return null;
    try {
      const v = await storage.getItem<string>(name, '');
      return typeof v === 'string' && v.length > 0 ? v : null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    if (!isBrowser) return;
    try {
      await storage.setItem(name, value);
    } catch {}
  },
  removeItem: async (name: string) => {
    if (!isBrowser) return;
    try {
      await storage.removeItem(name);
    } catch {}
  },
};

const defaultNotifications: NotificationSettings = {
  enabled: false,
  morning_enabled: true,
  morning_hour: 9,
  morning_minute: 0,
  evening_enabled: true,
  evening_hour: 21,
  evening_minute: 0,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      currentUserId: 'default_user',
      isOnboarded: false,
      receiptsUnlocked: false,
      pepperSpiceLevel: 'medium',
      nickname: '',
      notifications: defaultNotifications,

      setUser: (user) => set({ user }),
      // Sync an authenticated user into all the places the app reads identity from.
      setAuthUser: (user) =>
        set({
          user,
          currentUserId: user.id,
          nickname: user.nickname || user.name || '',
          pepperSpiceLevel: user.pepper_spice_level,
        }),
      setCurrentUserId: (id) => set({ currentUserId: id }),
      setIsOnboarded: (value) => set({ isOnboarded: value }),
      setReceiptsUnlocked: (value) => set({ receiptsUnlocked: value }),
      setPepperSpiceLevel: (level) => set({ pepperSpiceLevel: level }),
      setNickname: (n) => set({ nickname: n }),
      setNotifications: (n) =>
        set((state) => ({ notifications: { ...state.notifications, ...n } })),
      resetOnboarding: () => set({ isOnboarded: false }),
      logout: () =>
        set({
          user: null,
          currentUserId: 'default_user',
          receiptsUnlocked: false,
          isOnboarded: false,
        }),
    }),
    {
      name: 'saltcheck-app-state',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        isOnboarded: state.isOnboarded,
        pepperSpiceLevel: state.pepperSpiceLevel,
        nickname: state.nickname,
        notifications: state.notifications,
      }),
    }
  )
);
