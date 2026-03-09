// app/(auth)/signin.tsx
//
// SECOND PART OF THE FIX — navigate directly after sign-in:
//
// Even with a fixed AuthContext, relying on index.tsx to detect the session
// change and navigate doesn't work because index.tsx is UNMOUNTED after
// router.replace('/(auth)/signin'). Its useEffect can't fire on an
// unmounted component.
//
// Solution: after signInWithPassword succeeds, fetch the profile directly
// in this screen and navigate to the right destination immediately.
// We don't need to wait for AuthContext — Supabase already has the session.

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

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [showVerifyBanner, setShowVerifyBanner] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/onboarding');
    }
  };

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Enter a valid email';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignIn = async () => {
    if (!validate()) return;
    setShowVerifyBanner(false);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      if (
        error.message.toLowerCase().includes('email not confirmed') ||
        error.message.toLowerCase().includes('email_not_confirmed')
      ) {
        setShowVerifyBanner(true);
      } else if (
        error.message.toLowerCase().includes('invalid login') ||
        error.message.toLowerCase().includes('invalid credentials')
      ) {
        Alert.alert('Incorrect Credentials', 'The email or password you entered is incorrect.');
      } else {
        Alert.alert('Sign In Failed', error.message);
      }
      return;
    }

    // ── Sign-in succeeded — navigate directly ──────────────────────────────
    // index.tsx is unmounted so we can't rely on it detecting the session.
    // Fetch profile here and route to the correct screen immediately.
    if (data.user) {
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('profile_completed')
          .eq('id', data.user.id)
          .single();

        if (profileData?.profile_completed) {
          router.replace('/(app)/(tabs)/home');
        } else {
          router.replace('/(app)/profile-setup');
        }
      } catch {
        // If profile fetch fails for any reason, go to home
        // AuthContext will handle loading the profile in the background
        router.replace('/(app)/(tabs)/home');
      }
    }

    setLoading(false);
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Please enter your email address first.');
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: 'deepdiveai://auth/callback' },
    });
    setResending(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Email Sent!', `Verification email sent to ${email.trim().toLowerCase()}.`);
    }
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay visible={loading} message="Signing in..." />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity onPress={handleBack} style={{ marginBottom: SPACING.xl }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <Animated.View entering={FadeIn.duration(600)}>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600',
                letterSpacing: 2, textTransform: 'uppercase', marginBottom: SPACING.sm,
              }}>
                Welcome Back
              </Text>
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'],
                fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.sm,
              }}>
                Sign In
              </Text>
              <Text style={{
                color: COLORS.textSecondary, fontSize: FONTS.sizes.base,
                marginBottom: SPACING['2xl'],
              }}>
                Continue your research journey
              </Text>
            </Animated.View>

            {showVerifyBanner && (
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={{
                  backgroundColor: `${COLORS.warning}15`,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.md,
                  marginBottom: SPACING.xl,
                  borderWidth: 1,
                  borderColor: `${COLORS.warning}40`,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                }}
              >
                <Ionicons name="warning" size={20} color={COLORS.warning}
                  style={{ marginRight: 10, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: COLORS.warning, fontSize: FONTS.sizes.sm,
                    fontWeight: '700', marginBottom: 4,
                  }}>
                    Email Not Verified
                  </Text>
                  <Text style={{
                    color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
                    lineHeight: 18, marginBottom: SPACING.sm,
                  }}>
                    Please verify your email before signing in. Check your inbox for the link.
                  </Text>
                  <TouchableOpacity
                    onPress={handleResendVerification}
                    disabled={resending}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <Ionicons name="refresh-outline" size={14} color={COLORS.primary}
                      style={{ marginRight: 4 }} />
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                      {resending ? 'Sending...' : 'Resend verification email'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setShowVerifyBanner(false)}>
                  <Ionicons name="close" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.duration(600).delay(200)}>
              <AnimatedInput
                label="Email Address"
                value={email}
                onChangeText={(text) => { setEmail(text); setShowVerifyBanner(false); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                leftIcon="mail-outline"
                error={errors.email}
              />

              <AnimatedInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                isPassword
                leftIcon="lock-closed-outline"
                error={errors.password}
              />

              <TouchableOpacity
                onPress={() => router.push('/(auth)/forgot-password')}
                style={{ alignSelf: 'flex-end', marginBottom: SPACING.xl }}
              >
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>

              <GradientButton title="Sign In" onPress={handleSignIn} loading={loading} />

              <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.xl }}>
                <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginHorizontal: SPACING.md }}>
                  or
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base }}>
                  Don't have an account?{' '}
                </Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}