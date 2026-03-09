// app/(auth)/forgot-password.tsx
// Forgot Password screen.
// Sends a password reset email using Supabase Auth.
// The user gets an email with a link to reset their password.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { AnimatedInput } from '../../src/components/common/AnimatedInput';
import { GradientButton } from '../../src/components/common/GradientButton';
import { LoadingOverlay } from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false); // true after email is sent
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);

    const { error: supabaseError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        // After clicking the link in the email, the user is redirected here
        // For mobile, this uses the app scheme defined in app.json
        redirectTo: 'deepdiveai://reset-password',
      }
    );
    setLoading(false);

    if (supabaseError) {
      Alert.alert('Error', supabaseError.message);
    } else {
      setSent(true); // Show success state
    }
  };

  // Success state — show confirmation message
  if (sent) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
          <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center' }}>
            {/* Success icon */}
            <LinearGradient
              colors={COLORS.gradientSuccess}
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: SPACING.xl,
              }}
            >
              <Ionicons name="mail-open" size={48} color="#FFFFFF" />
            </LinearGradient>

            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes['2xl'],
              fontWeight: '800',
              textAlign: 'center',
              marginBottom: SPACING.md,
            }}>
              Check Your Email
            </Text>

            <Text style={{
              color: COLORS.textSecondary,
              fontSize: FONTS.sizes.base,
              textAlign: 'center',
              lineHeight: 24,
              marginBottom: SPACING['2xl'],
            }}>
              We sent a password reset link to{' '}
              <Text style={{ color: COLORS.primary, fontWeight: '600' }}>{email}</Text>
              .{'\n'}Check your inbox and click the link to reset your password.
            </Text>

            <GradientButton
              title="Back to Sign In"
              onPress={() => router.replace('/(auth)/signin')}
            />
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay visible={loading} message="Sending reset link..." />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginBottom: SPACING.xl }}
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <Animated.View entering={FadeIn.duration(600)}>
              {/* Lock icon */}
              <LinearGradient
                colors={COLORS.gradientPrimary}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: SPACING.xl,
                }}
              >
                <Ionicons name="key" size={36} color="#FFFFFF" />
              </LinearGradient>

              <Text style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes['3xl'],
                fontWeight: '800',
                letterSpacing: -0.5,
                marginBottom: SPACING.sm,
              }}>
                Forgot Password?
              </Text>

              <Text style={{
                color: COLORS.textSecondary,
                fontSize: FONTS.sizes.base,
                lineHeight: 24,
                marginBottom: SPACING['2xl'],
              }}>
                No worries! Enter your email address and we'll send you a link to reset your password.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(600).delay(200)}>
              <AnimatedInput
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon="mail-outline"
                error={error}
              />

              <GradientButton
                title="Send Reset Link"
                onPress={handleReset}
                loading={loading}
                style={{ marginTop: SPACING.md }}
              />

              <TouchableOpacity
                onPress={() => router.back()}
                style={{ alignItems: 'center', marginTop: SPACING.xl }}
              >
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base }}>
                  Remember your password?{' '}
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}