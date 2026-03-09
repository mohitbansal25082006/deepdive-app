// app/(app)/(tabs)/history.tsx
// Research History — placeholder for Part 2.
// Will show past research topics and saved reports.

import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING } from '../../../src/constants/theme';

export default function HistoryScreen() {
  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
        <Ionicons name="time-outline" size={64} color={COLORS.border} />
        <Text style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.xl,
          fontWeight: '700',
          marginTop: SPACING.lg,
          textAlign: 'center',
        }}>
          Research History
        </Text>
        <Text style={{
          color: COLORS.textSecondary,
          fontSize: FONTS.sizes.base,
          textAlign: 'center',
          marginTop: SPACING.md,
        }}>
          Your past research will appear here.
          Complete a research query to see it saved here.
        </Text>
        <Text style={{
          color: COLORS.primary,
          fontSize: FONTS.sizes.sm,
          marginTop: SPACING.lg,
          fontWeight: '600',
        }}>
          Coming in Part 2
        </Text>
      </SafeAreaView>
    </LinearGradient>
  );
}