// src/components/common/AccountDeletedScreen.tsx
// Part 32 — Full-screen screen shown when an admin permanently deletes the user's account.
// Rendered by app/(app)/_layout.tsx when AuthContext detects a profile DELETE Realtime event.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { SafeAreaView }      from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAuth }           from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

export function AccountDeletedScreen() {
  const { clearDeletedState } = useAuth();

  // Tapping "Continue" clears the deleted flag and routes to onboarding
  const handleContinue = () => {
    clearDeletedState();
  };

  return (
    <LinearGradient
      colors={[COLORS.background, '#0e0e0e', '#111']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Decorative background circles */}
        <View style={styles.bgCircle1} pointerEvents="none" />
        <View style={styles.bgCircle2} pointerEvents="none" />

        <Animated.View entering={FadeIn.duration(600)} style={styles.content}>

          {/* Icon */}
          <Animated.View
            entering={FadeInDown.duration(700).delay(100)}
            style={styles.iconWrapper}
          >
            <LinearGradient
              colors={['#374151', '#6B7280']}
              style={styles.iconGradient}
            >
              <Ionicons name="person-remove" size={52} color="#FFF" />
            </LinearGradient>
          </Animated.View>

          {/* Text */}
          <Animated.View entering={FadeInDown.duration(700).delay(200)}>
            <Text style={styles.eyebrow}>ACCOUNT STATUS</Text>
            <Text style={styles.title}>Account Deleted</Text>
            <Text style={styles.subtitle}>
              Your DeepDive AI account has been permanently deleted by our
              moderation team.
            </Text>
          </Animated.View>

          {/* Info box */}
          <Animated.View
            entering={FadeInDown.duration(700).delay(300)}
            style={styles.infoBox}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#9CA3AF"
              style={{ marginRight: 10, marginTop: 1 }}
            />
            <Text style={styles.infoText}>
              All your data including research reports, credits, workspaces, and
              settings have been permanently removed. This action cannot be undone.
            </Text>
          </Animated.View>

          {/* CTA */}
          <Animated.View
            entering={FadeInDown.duration(700).delay(400)}
            style={styles.buttonGroup}
          >
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#374151', '#4B5563']}
                style={styles.primaryButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
                <Text style={styles.primaryButtonText}>Go to Sign In</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Footer note */}
          <Animated.Text
            entering={FadeInDown.duration(700).delay(500)}
            style={styles.footerNote}
          >
            If you believe this was a mistake, please create a new account and
            contact our support team.
          </Animated.Text>

        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  bgCircle1: {
    position:     'absolute',
    top:          -100,
    right:        -60,
    width:        280,
    height:       280,
    borderRadius: 140,
    backgroundColor: 'rgba(107, 114, 128, 0.05)',
  },
  bgCircle2: {
    position:     'absolute',
    bottom:       -80,
    left:         -80,
    width:        240,
    height:       240,
    borderRadius: 120,
    backgroundColor: 'rgba(107, 114, 128, 0.04)',
  },
  content: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: SPACING['2xl'],
    paddingVertical:   SPACING.xl,
  },
  iconWrapper: {
    marginBottom:  SPACING['2xl'],
    shadowColor:   '#6B7280',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius:  20,
    elevation:     8,
  },
  iconGradient: {
    width:          100,
    height:         100,
    borderRadius:   50,
    alignItems:     'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color:         '#6B7280',
    fontSize:      FONTS.sizes.xs,
    fontWeight:    '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    textAlign:     'center',
    marginBottom:  SPACING.sm,
  },
  title: {
    color:         COLORS.textPrimary,
    fontSize:      FONTS.sizes['3xl'],
    fontWeight:    '800',
    letterSpacing: -0.5,
    textAlign:     'center',
    marginBottom:  SPACING.md,
  },
  subtitle: {
    color:        COLORS.textSecondary,
    fontSize:     FONTS.sizes.base,
    lineHeight:   24,
    textAlign:    'center',
    marginBottom: SPACING.xl,
  },
  infoBox: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    backgroundColor: 'rgba(107, 114, 128, 0.08)',
    borderWidth:     1,
    borderColor:     'rgba(107, 114, 128, 0.18)',
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    marginBottom:    SPACING['2xl'],
    width:           '100%',
  },
  infoText: {
    flex:       1,
    color:      '#9CA3AF',
    fontSize:   FONTS.sizes.sm,
    lineHeight: 20,
  },
  buttonGroup: {
    width:        '100%',
    marginBottom: SPACING.xl,
  },
  primaryButton: {
    borderRadius: RADIUS.xl,
    overflow:     'hidden',
  },
  primaryButtonGradient: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    paddingVertical:   16,
    paddingHorizontal: SPACING.xl,
    gap:               SPACING.sm,
  },
  primaryButtonText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  footerNote: {
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.xs,
    textAlign:  'center',
    lineHeight: 18,
    paddingHorizontal: SPACING.xl,
  },
});