// src/components/common/AccountSuspendedScreen.tsx
// Part 32 — Full-screen overlay shown when the user's account is suspended.
// Rendered by app/(app)/_layout.tsx when profile.account_status === 'suspended'.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { LinearGradient }     from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import { SafeAreaView }       from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAuth }            from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const SUPPORT_EMAIL = 'support@deepdiveai.com';

export function AccountSuspendedScreen() {
  const { signOut } = useAuth();

  const handleContactSupport = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=Account%20Suspension%20Review`,
    ).catch(() => {/* email app not available */});
  };

  return (
    <LinearGradient
      colors={[COLORS.background, '#150808', '#1a0a0a']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Background decorative circles */}
        <View style={styles.bgCircle1} pointerEvents="none" />
        <View style={styles.bgCircle2} pointerEvents="none" />

        <Animated.View entering={FadeIn.duration(600)} style={styles.content}>

          {/* Icon */}
          <Animated.View
            entering={FadeInDown.duration(700).delay(100)}
            style={styles.iconWrapper}
          >
            <LinearGradient
              colors={['#7F1D1D', '#EF4444']}
              style={styles.iconGradient}
            >
              <Ionicons name="ban" size={52} color="#FFF" />
            </LinearGradient>
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.duration(700).delay(200)}>
            <Text style={styles.eyebrow}>ACCOUNT STATUS</Text>
            <Text style={styles.title}>Account Suspended</Text>
            <Text style={styles.subtitle}>
              Your access to DeepDive AI has been temporarily suspended by our
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
              color="#FCA5A5"
              style={{ marginRight: 10, marginTop: 1 }}
            />
            <Text style={styles.infoText}>
              All your existing research reports, settings, and data are safe.
              Suspensions are typically reviewed within 24–48 hours.
            </Text>
          </Animated.View>

          {/* Action buttons */}
          <Animated.View
            entering={FadeInDown.duration(700).delay(400)}
            style={styles.buttonGroup}
          >
            {/* Contact support */}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleContactSupport}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#DC2626', '#EF4444']}
                style={styles.primaryButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="mail-outline" size={18} color="#FFF" />
                <Text style={styles.primaryButtonText}>Contact Support</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Sign out */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={signOut}
              activeOpacity={0.7}
            >
              <Ionicons
                name="log-out-outline"
                size={16}
                color={COLORS.textSecondary}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.secondaryButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Support email hint */}
          <Animated.Text
            entering={FadeInDown.duration(700).delay(500)}
            style={styles.emailHint}
          >
            {SUPPORT_EMAIL}
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
    top:          -120,
    right:        -80,
    width:        320,
    height:       320,
    borderRadius: 160,
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  bgCircle2: {
    position:     'absolute',
    bottom:       -100,
    left:         -100,
    width:        280,
    height:       280,
    borderRadius: 140,
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
  },
  content: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingVertical:   SPACING.xl,
  },
  iconWrapper: {
    marginBottom: SPACING['2xl'],
    shadowColor:  '#EF4444',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius:  24,
    elevation:     12,
  },
  iconGradient: {
    width:          100,
    height:         100,
    borderRadius:   50,
    alignItems:     'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color:        '#EF4444',
    fontSize:     FONTS.sizes.xs,
    fontWeight:   '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    textAlign:    'center',
    marginBottom: SPACING.sm,
  },
  title: {
    color:        COLORS.textPrimary,
    fontSize:     FONTS.sizes['3xl'],
    fontWeight:   '800',
    letterSpacing: -0.5,
    textAlign:    'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    color:      COLORS.textSecondary,
    fontSize:   FONTS.sizes.base,
    lineHeight: 24,
    textAlign:  'center',
    marginBottom: SPACING.xl,
  },
  infoBox: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth:     1,
    borderColor:     'rgba(239, 68, 68, 0.2)',
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    marginBottom:    SPACING['2xl'],
    width:           '100%',
  },
  infoText: {
    flex:       1,
    color:      '#FCA5A5',
    fontSize:   FONTS.sizes.sm,
    lineHeight: 20,
  },
  buttonGroup: {
    width:        '100%',
    gap:          SPACING.md,
    marginBottom: SPACING.xl,
  },
  primaryButton: {
    borderRadius: RADIUS.xl,
    overflow:     'hidden',
    shadowColor:  '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius:  16,
    elevation:    8,
  },
  primaryButtonGradient: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical:   16,
    paddingHorizontal: SPACING.xl,
    gap:            SPACING.sm,
  },
  primaryButtonText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical:   14,
    paddingHorizontal: SPACING.xl,
    borderRadius:   RADIUS.xl,
    borderWidth:    1,
    borderColor:    COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  secondaryButtonText: {
    color:    COLORS.textSecondary,
    fontSize: FONTS.sizes.base,
    fontWeight: '600',
  },
  emailHint: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
});