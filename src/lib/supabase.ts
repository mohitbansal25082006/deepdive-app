// src/lib/supabase.ts
// This creates the Supabase client that connects to your backend.
// We use AsyncStorage so the user stays logged in even after closing the app.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

// createClient initializes the connection to Supabase
// We pass AsyncStorage so auth sessions persist between app opens
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,   // Automatically refreshes expired tokens
    persistSession: true,      // Saves session to storage
    detectSessionInUrl: false, // Not needed for mobile (only for web)
  },
});

// This tells Supabase to refresh the auth token when the app comes back
// to the foreground (e.g., user switches back from another app)
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});