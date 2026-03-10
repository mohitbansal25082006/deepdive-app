// app/(app)/_layout.tsx
// Stack layout for the entire app section.
// Adds the new research screens (input, progress, report) to the stack.

import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#0A0A1A' },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="research-input"
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
      <Stack.Screen
        name="research-progress"
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen
        name="research-report"
        options={{ animation: 'slide_from_right' }}
      />
    </Stack>
  );
}