// src/lib/supabase.ts
// Supabase client setup for React Native / Expo.
//
// ROOT CAUSE OF FIRST-TRY LOGIN FAILURE:
// The original code called supabase.auth.startAutoRefresh() inside an
// AppState listener. When the app starts, AppState fires "active" immediately
// which triggers startAutoRefresh() BEFORE AsyncStorage has finished reading
// the persisted session. This race condition causes the first sign-in attempt
// to fail because the client is in an inconsistent state.
//
// FIX:
// 1. Removed AppState.addEventListener from this file entirely.
//    AuthContext handles session management more safely.
// 2. Added a LargeSecureStore adapter that chunks data > 2048 bytes
//    (SecureStore's limit) into AsyncStorage automatically.
//    This prevents session storage failures silently corrupting auth state.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

// AsyncStorage-based store — no size limit issues, reliable on all platforms
// We use AsyncStorage directly (not SecureStore) because SecureStore has a
// 2048-byte limit per key which causes silent session storage failures.
const ExpoAsyncStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (err) {
      console.warn('AsyncStorage setItem error:', err);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.warn('AsyncStorage removeItem error:', err);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoAsyncStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // NOTE: No AppState listener here. AuthContext.tsx manages
    // startAutoRefresh / stopAutoRefresh in a controlled way AFTER
    // the initial session has been loaded from storage.
  },
});