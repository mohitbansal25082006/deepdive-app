// app/(app)/(tabs)/_layout.tsx
// Part 36B — UPDATED: Added "Feed" tab between History and Teams.
// 7 tabs total: Research | History | Feed | Teams | Podcast | Debate | Profile
//
// The Feed tab icon shows a small unread dot when hasNew is true.
// All Part 10–35 tabs and logic preserved unchanged.

import { Tabs }                   from 'expo-router';
import { View, Text, Platform }   from 'react-native';
import { Ionicons }               from '@expo/vector-icons';
import { BlurView }               from 'expo-blur';
import { useSafeAreaInsets }      from 'react-native-safe-area-context';
import { useAuth }                from '../../../src/context/AuthContext';
import { useFollowingFeed }       from '../../../src/hooks/useFollowingFeed';
import { COLORS, FONTS }          from '../../../src/constants/theme';

// ─── Tab icon ─────────────────────────────────────────────────────────────────

function TabIcon({
  name,
  focused,
  label,
  badgeDot,
}: {
  name:      keyof typeof Ionicons.glyphMap;
  focused:   boolean;
  label:     string;
  badgeDot?: boolean;
}) {
  return (
    <View style={{
      alignItems:     'center',
      justifyContent: 'center',
      paddingTop:     9,
      width:          52,
    }}>
      {/* Active indicator dot */}
      {focused ? (
        <View style={{
          width:           4,
          height:          4,
          borderRadius:    2,
          backgroundColor: COLORS.primary,
          marginBottom:    4,
        }} />
      ) : (
        <View style={{ height: 8 }} />
      )}

      {/* Icon with optional unread dot */}
      <View style={{ position: 'relative' }}>
        <Ionicons
          name={focused ? name : (`${name}-outline` as any)}
          size={20}
          color={focused ? COLORS.primary : COLORS.textMuted}
        />
        {/* Unread dot — only when tab is not focused */}
        {badgeDot && !focused && (
          <View style={{
            position:        'absolute',
            top:             -2,
            right:           -2,
            width:           8,
            height:          8,
            borderRadius:    4,
            backgroundColor: COLORS.error,
            borderWidth:     1.5,
            borderColor:     COLORS.background,
          }} />
        )}
      </View>

      <Text
        numberOfLines={1}
        style={{
          color:         focused ? COLORS.primary : COLORS.textMuted,
          fontSize:      9,
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

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const insets       = useSafeAreaInsets();
  const tabBarHeight = 64 + insets.bottom;
  const { user }     = useAuth();

  // Feed "hasNew" — drives the unread dot on the Feed tab
  const { hasNew } = useFollowingFeed(user?.id ?? null);

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
      {/* ── 1. Research ── */}
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="search" focused={focused} label="Research" />
          ),
        }}
      />

      {/* ── 2. History ── */}
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="time" focused={focused} label="History" />
          ),
        }}
      />

      {/* ── 3. Feed (NEW — Part 36) ── */}
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="newspaper"
              focused={focused}
              label="Feed"
              badgeDot={hasNew}
            />
          ),
        }}
      />

      {/* ── 4. Teams (Workspace — Part 10) ── */}
      <Tabs.Screen
        name="workspace"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="people" focused={focused} label="Teams" />
          ),
        }}
      />

      {/* ── 5. Podcast (Part 8) ── */}
      <Tabs.Screen
        name="podcast"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="radio" focused={focused} label="Podcast" />
          ),
        }}
      />

      {/* ── 6. Debate (Part 9) ── */}
      <Tabs.Screen
        name="debate"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="chatbox-ellipses" focused={focused} label="Debate" />
          ),
        }}
      />

      {/* ── 7. Profile ── */}
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