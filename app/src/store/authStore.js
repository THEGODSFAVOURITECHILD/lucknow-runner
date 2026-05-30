import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// Auth store — the single source of truth for login state
// Token is saved to device secure storage so the user stays logged in
// between app restarts

const useAuthStore = create((set, get) => ({
  user:      null,
  token:     null,
  isLoggedIn: false,
  isLoading:  true,   // true until we check secure storage on startup

  // ── Call this once in App.js on mount ──────────────────────────────────────
  initialize: async () => {
    try {
      const token   = await SecureStore.getItemAsync('sektorrun_token');
      const userStr = await SecureStore.getItemAsync('sektorrun_user');

      if (token && userStr) {
        set({
          token,
          user: JSON.parse(userStr),
          isLoggedIn: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  // ── Called after successful login or signup ────────────────────────────────
  login: async (token, user) => {
    await SecureStore.setItemAsync('sektorrun_token', token);
    await SecureStore.setItemAsync('sektorrun_user', JSON.stringify(user));
    set({ token, user, isLoggedIn: true });
  },

  // ── Update stored user data (after profile edit) ──────────────────────────
  updateUser: async (updatedUser) => {
    const merged = { ...get().user, ...updatedUser };
    await SecureStore.setItemAsync('sektorrun_user', JSON.stringify(merged));
    set({ user: merged });
  },

  // ── Log out ────────────────────────────────────────────────────────────────
  logout: async () => {
    await SecureStore.deleteItemAsync('sektorrun_token');
    await SecureStore.deleteItemAsync('sektorrun_user');
    set({ token: null, user: null, isLoggedIn: false });
  },
}));

export default useAuthStore;
