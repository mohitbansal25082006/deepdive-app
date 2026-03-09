// app/(app)/(tabs)/_layout.tsx
// The bottom tab navigation — the bar at the bottom of the app
// with Home, History, and Profile tabs.

import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { COLORS, FONTS } from '../../../src/constants/theme';

// Custom tab bar icon component
function TabIcon({
  name,
  focused,
  label,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  label: string;
}) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      {/* Active indicator dot above icon */}
      {focused && (
        <View style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: COLORS.primary,
          marginBottom: 4,
        }} />
      )}
      <Ionicons
        name={focused ? name : `${name}-outline` as any}
        size={24}
        color={focused ? COLORS.primary : COLORS.textMuted}
      />
      <Text style={{
        color: focused ? COLORS.primary : COLORS.textMuted,
        fontSize: FONTS.sizes.xs,
        marginTop: 2,
        fontWeight: focused ? '600' : '400',
      }}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
          height: 80,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={60}
            style={{
              flex: 1,
              backgroundColor: 'rgba(10, 10, 26, 0.85)',
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
            }}
          />
        ),
        tabBarShowLabel: false, // We show labels in our custom icon
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="search" focused={focused} label="Research" />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="time" focused={focused} label="History" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="person" focused={focused} label="Profile" />
          ),
        }}
      />
    </Tabs>
  );
}