import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { CONFIG } from '../constants/config';

// ─── Base Axios client ────────────────────────────────────────────────────────
// All API calls go through this — it auto-attaches the JWT token
const api = axios.create({
  baseURL: CONFIG.API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token automatically to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('sektorrun_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Auth API calls ───────────────────────────────────────────────────────────
export const authAPI = {

  // Send Google ID token → get back either a JWT or a "needsUsername" flag
  googleLogin: async (idToken) => {
    const { data } = await api.post('/auth/google', { idToken });
    return data;
  },

  // Check if a username is available as the user types
  checkUsername: async (username) => {
    const { data } = await api.get(`/auth/username/check/${username}`);
    return data;
  },

  // New user picks username and nickname after Google sign-in
  completeGoogleSignup: async ({ username, nickname, email, googleId, profilePhoto }) => {
    const { data } = await api.post('/auth/google/complete', {
      username, nickname, email, googleId, profilePhoto,
    });
    return data;
  },

  // Get current user's profile
  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },

  // Update nickname or profile photo
  updateProfile: async (updates) => {
    const { data } = await api.patch('/auth/me', updates);
    return data;
  },
};

// ─── Territory API calls ──────────────────────────────────────────────────────
export const territoriesAPI = {

  // Load all territories for the map
  getAll: async () => {
    const { data } = await api.get('/territories');
    return data;
  },

  // Submit a captured territory after closing the loop
  capture: async ({ polygonCoords, areaSqm, centerLat, centerLng }) => {
    const { data } = await api.post('/territories/capture', {
      polygonCoords, areaSqm, centerLat, centerLng,
    });
    return data;
  },

  // Register that this user has started running in an area (for racing)
  startAttempt: async (lat, lng) => {
    const { data } = await api.post('/territories/attempt', { lat, lng });
    return data;
  },

  // Cancel attempt when user stops running
  cancelAttempt: async () => {
    const { data } = await api.delete('/territories/attempt');
    return data;
  },

  // Reinforce an existing territory (+2 hours)
  reinforce: async (territoryId) => {
    const { data } = await api.post(`/territories/${territoryId}/reinforce`);
    return data;
  },

  // Check if anyone else is racing for the same area
  checkNearby: async (lat, lng) => {
    const { data } = await api.get(`/territories/nearby?lat=${lat}&lng=${lng}`);
    return data;
  },
};

// ─── Runs API calls ───────────────────────────────────────────────────────────
export const runsAPI = {

  save: async (runData) => {
    const { data } = await api.post('/runs', runData);
    return data;
  },

  getHistory: async () => {
    const { data } = await api.get('/runs/history');
    return data;
  },

  getStats: async () => {
    const { data } = await api.get('/runs/stats');
    return data;
  },
};

// ─── Leaderboard API calls ────────────────────────────────────────────────────
export const leaderboardAPI = {
  daily:   async () => { const { data } = await api.get('/leaderboard/daily');   return data; },
  weekly:  async () => { const { data } = await api.get('/leaderboard/weekly');  return data; },
  monthly: async () => { const { data } = await api.get('/leaderboard/monthly'); return data; },
  alltime: async () => { const { data } = await api.get('/leaderboard/alltime'); return data; },
};

// ─── Businesses API calls ─────────────────────────────────────────────────────
export const businessesAPI = {

  getAll: async () => {
    const { data } = await api.get('/businesses');
    return data;
  },

  add: async ({ name, category, lat, lng, description }) => {
    const { data } = await api.post('/businesses', { name, category, lat, lng, description });
    return data;
  },

  getMine: async () => {
    const { data } = await api.get('/businesses/mine');
    return data;
  },

  remove: async (id) => {
    const { data } = await api.delete(`/businesses/${id}`);
    return data;
  },
};

export default api;
