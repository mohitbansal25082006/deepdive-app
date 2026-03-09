// app/_layout.tsx
// The root layout is the outermost wrapper for your entire app.
// Everything inside this file wraps ALL screens.
// We put the AuthProvider here so every screen can access auth state.

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../src/context/AuthContext';
import * as SplashScreen from 'expo-splash-screen';

// Prevent the splash screen from hiding automatically
// We will hide it manually when auth state is determined
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    // Hide splash screen after a short delay
    const timer = setTimeout(() => {
      SplashScreen.hideAsync();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    // GestureHandlerRootView is required for react-native-gesture-handler
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* AuthProvider makes auth available to all screens */}
      <AuthProvider>
        {/* Stack is the navigation container */}
        <Stack screenOptions={{ headerShown: false }}>
          {/* index.tsx decides where to send the user based on auth state */}
          <Stack.Screen name="index" />
          {/* (auth) group contains sign in/up screens */}
          <Stack.Screen name="(auth)" />
          {/* (app) group contains the main app screens */}
          <Stack.Screen name="(app)" />
        </Stack>
        <StatusBar style="light" />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}