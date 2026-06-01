import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  pepper_spice_level: 'mild' | 'medium' | 'extra_spicy';
  timezone: string;
}

interface AppState {
  user: User | null;
  currentUserId: string;
  isOnboarded: boolean;
  receiptsUnlocked: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setCurrentUserId: (id: string) => void;
  setIsOnboarded: (value: boolean) => void;
  setReceiptsUnlocked: (value: boolean) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  currentUserId: 'default_user', // For MVP, using a default user
  isOnboarded: false,
  receiptsUnlocked: false,
  
  setUser: (user) => set({ user }),
  setCurrentUserId: (id) => set({ currentUserId: id }),
  setIsOnboarded: (value) => set({ isOnboarded: value }),
  setReceiptsUnlocked: (value) => set({ receiptsUnlocked: value }),
  logout: () => set({ user: null, currentUserId: 'default_user', receiptsUnlocked: false }),
}));
