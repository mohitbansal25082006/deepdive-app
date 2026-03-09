// app/(auth)/_layout.tsx
// Layout for the authentication screens group.
// All screens inside (auth) folder share this layout.

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,          // No header bar
        animation: 'slide_from_right', // Slide animation between auth screens
        contentStyle: { backgroundColor: '#0A0A1A' },
      }}
    />
  );
}