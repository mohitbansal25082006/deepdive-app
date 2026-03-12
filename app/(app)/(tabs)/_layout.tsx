// app/(app)/(tabs)/_layout.tsx
// Part 9: Added Debate tab between Podcast and Profile.
// 5 tabs total: Research | History | Podcast | Debate | Profile

import { Tabs }                  from 'expo-router';
import { View, Text, Platform }  from 'react-native';
import { Ionicons }              from '@expo/vector-icons';
import { BlurView }              from 'expo-blur';
import { useSafeAreaInsets }     from 'react-native-safe-area-context';
import { COLORS, FONTS }         from '../../../src/constants/theme';

function TabIcon({
  name,
  focused,
  label,
}: {
  name:    keyof typeof Ionicons.glyphMap;
  focused: boolean;
  label:   string;
}) {
  return (
    <View style={{
      alignItems:     'center',
      justifyContent: 'center',
      paddingTop:     10,
      width:          58, // slightly narrower to fit 5 tabs
    }}>
      {/* Active indicator dot */}
      {focused ? (
        <View style={{
          width:           4,
          height:          4,
          borderRadius:    2,
          backgroundColor: COLORS.primary,
          marginBottom:    5,
        }} />
      ) : (
        <View style={{ height: 9 }} />
      )}

      <Ionicons
        name={focused ? name : (`${name}-outline` as any)}
        size={21}
        color={focused ? COLORS.primary : COLORS.textMuted}
      />

      <Text
        numberOfLines={1}
        style={{
          color:         focused ? COLORS.primary : COLORS.textMuted,
          fontSize:      9.5,
          marginTop:     3,
          fontWeight:    focused ? '700' : '400',
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  const tabBarHeight = 64 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position:        'absolute',
          bottom:          0,
          left:            0,
          right:           0,
          height:          tabBarHeight,
          borderTopWidth:  0,
          backgroundColor: 'transparent',
          elevation:       0,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={70}
            tint="dark"
            style={{
              flex:            1,
              backgroundColor: Platform.OS === 'android'
                ? 'rgba(10, 10, 26, 0.96)'
                : 'rgba(10, 10, 26, 0.80)',
              borderTopWidth:  1,
              borderTopColor:  COLORS.border,
            }}
          />
        ),
        tabBarShowLabel: false,
        tabBarItemStyle: {
          flex:           1,
          alignItems:     'center',
          justifyContent: 'flex-start',
          paddingBottom:  0,
        },
      }}
    >
      {/* ── Research ── */}
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="search" focused={focused} label="Research" />
          ),
        }}
      />

      {/* ── History ── */}
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="time" focused={focused} label="History" />
          ),
        }}
      />

      {/* ── Podcast (Part 8) ── */}
      <Tabs.Screen
        name="podcast"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="radio" focused={focused} label="Podcast" />
          ),
        }}
      />

      {/* ── Debate (NEW — Part 9) ── */}
      <Tabs.Screen
        name="debate"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="people" focused={focused} label="Debate" />
          ),
        }}
      />

      {/* ── Profile ── */}
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