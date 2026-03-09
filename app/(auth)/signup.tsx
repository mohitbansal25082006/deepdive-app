// app/(auth)/signup.tsx
// Sign Up screen for new user registration.
// FIXED: After sign up, shows email verification screen.
// User must verify email before they can sign in.

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

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [signedUp, setSignedUp] = useState(false); // shows verification screen
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resending, setResending] = useState(false);

  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Enter a valid email';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 8)
      newErrors.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
        // This tells Supabase to send a confirmation email
        // and require verification before the session is created
        emailRedirectTo: 'deepdiveai://auth/callback',
      },
    });
    setLoading(false);

    if (error) {
      // Handle common signup errors with friendly messages
      if (error.message.includes('already registered')) {
        Alert.alert(
          'Email Already Used',
          'An account with this email already exists. Please sign in instead.',
          [
            { text: 'Sign In', onPress: () => router.replace('/(auth)/signin') },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Sign Up Failed', error.message);
      }
      return;
    }

    // Supabase returns a session immediately if email confirmation is OFF
    // It returns null session if email confirmation is ON (which we want)
    if (data.user && !data.session) {
      // Email confirmation is ON — show verification screen
      setRegisteredEmail(email.trim().toLowerCase());
      setSignedUp(true);
    } else if (data.user && data.session) {
      // Email confirmation is OFF in Supabase settings
      // Still show a success message before going to the app
      setRegisteredEmail(email.trim().toLowerCase());
      setSignedUp(true);
    }
  };

  // Resend the verification email if user didn't receive it
  const handleResendEmail = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: registeredEmail,
      options: {
        emailRedirectTo: 'deepdiveai://auth/callback',
      },
    });
    setResending(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Email Sent!', 'A new verification email has been sent to ' + registeredEmail);
    }
  };

  // ============================================================
  // EMAIL VERIFICATION SCREEN
  // Shown after successful signup
  // ============================================================
  if (signedUp) {
    return (
      <LinearGradient
        colors={[COLORS.background, COLORS.backgroundCard]}
        style={{ flex: 1 }}
      >
        <SafeAreaView
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: SPACING.xl,
          }}
        >
          <Animated.View
            entering={FadeIn.duration(700)}
            style={{ alignItems: 'center', width: '100%' }}
          >
            {/* Animated mail icon */}
            <LinearGradient
              colors={COLORS.gradientPrimary}
              style={{
                width: 110,
                height: 110,
                borderRadius: 55,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: SPACING.xl,
                shadowColor: COLORS.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.45,
                shadowRadius: 20,
                elevation: 12,
              }}
            >
              <Ionicons name="mail-unread" size={52} color="#FFFFFF" />
            </LinearGradient>

            {/* Title */}
            <Text
              style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes['3xl'],
                fontWeight: '800',
                textAlign: 'center',
                letterSpacing: -0.5,
                marginBottom: SPACING.sm,
              }}
            >
              Verify Your Email
            </Text>

            {/* Subtitle */}
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: FONTS.sizes.base,
                textAlign: 'center',
                lineHeight: 24,
                marginBottom: SPACING.xl,
              }}
            >
              We sent a verification link to
            </Text>

            {/* Email display pill */}
            <View
              style={{
                backgroundColor: `${COLORS.primary}20`,
                borderRadius: RADIUS.full,
                paddingHorizontal: SPACING.lg,
                paddingVertical: SPACING.sm,
                borderWidth: 1,
                borderColor: `${COLORS.primary}40`,
                marginBottom: SPACING.xl,
              }}
            >
              <Text
                style={{
                  color: COLORS.primary,
                  fontSize: FONTS.sizes.base,
                  fontWeight: '700',
                }}
              >
                {registeredEmail}
              </Text>
            </View>

            {/* Instructions card */}
            <View
              style={{
                backgroundColor: COLORS.backgroundCard,
                borderRadius: RADIUS.xl,
                padding: SPACING.lg,
                borderWidth: 1,
                borderColor: COLORS.border,
                width: '100%',
                marginBottom: SPACING.xl,
              }}
            >
              {/* Step 1 */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  marginBottom: SPACING.md,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: COLORS.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                    marginTop: 2,
                  }}
                >
                  <Text
                    style={{
                      color: '#FFF',
                      fontSize: FONTS.sizes.xs,
                      fontWeight: '700',
                    }}
                  >
                    1
                  </Text>
                </View>
                <Text
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: FONTS.sizes.sm,
                    flex: 1,
                    lineHeight: 20,
                  }}
                >
                  Open your email inbox and find the email from DeepDive AI
                </Text>
              </View>

              {/* Step 2 */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  marginBottom: SPACING.md,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: COLORS.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                    marginTop: 2,
                  }}
                >
                  <Text
                    style={{
                      color: '#FFF',
                      fontSize: FONTS.sizes.xs,
                      fontWeight: '700',
                    }}
                  >
                    2
                  </Text>
                </View>
                <Text
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: FONTS.sizes.sm,
                    flex: 1,
                    lineHeight: 20,
                  }}
                >
                  Click the{' '}
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                    "Confirm your email"
                  </Text>{' '}
                  button in the email
                </Text>
              </View>

              {/* Step 3 */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: COLORS.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                    marginTop: 2,
                  }}
                >
                  <Text
                    style={{
                      color: '#FFF',
                      fontSize: FONTS.sizes.xs,
                      fontWeight: '700',
                    }}
                  >
                    3
                  </Text>
                </View>
                <Text
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: FONTS.sizes.sm,
                    flex: 1,
                    lineHeight: 20,
                  }}
                >
                  Come back to the app and sign in with your credentials
                </Text>
              </View>
            </View>

            {/* Go to Sign In button */}
            <GradientButton
              title="Go to Sign In"
              onPress={() => router.replace('/(auth)/signin')}
              style={{ width: '100%', marginBottom: SPACING.md }}
            />

            {/* Resend email button */}
            <TouchableOpacity
              onPress={handleResendEmail}
              disabled={resending}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: SPACING.sm,
              }}
            >
              {resending ? (
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                  Sending...
                </Text>
              ) : (
                <>
                  <Ionicons
                    name="refresh-outline"
                    size={16}
                    color={COLORS.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={{
                      color: COLORS.textSecondary,
                      fontSize: FONTS.sizes.sm,
                    }}
                  >
                    Didn't receive it?{' '}
                    <Text
                      style={{ color: COLORS.primary, fontWeight: '600' }}
                    >
                      Resend Email
                    </Text>
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Spam note */}
            <Text
              style={{
                color: COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
                textAlign: 'center',
                marginTop: SPACING.md,
                lineHeight: 18,
              }}
            >
              Can't find it? Check your spam or junk folder.
            </Text>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================================
  // SIGN UP FORM SCREEN
  // ============================================================
  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay visible={loading} message="Creating account..." />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back button */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginBottom: SPACING.xl }}
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>

            {/* Header */}
            <Animated.View entering={FadeIn.duration(600)}>
              <Text
                style={{
                  color: COLORS.textMuted,
                  fontSize: FONTS.sizes.sm,
                  fontWeight: '600',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  marginBottom: SPACING.sm,
                }}
              >
                New Account
              </Text>
              <Text
                style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes['3xl'],
                  fontWeight: '800',
                  letterSpacing: -0.5,
                  marginBottom: SPACING.sm,
                }}
              >
                Create Account
              </Text>
              <Text
                style={{
                  color: COLORS.textSecondary,
                  fontSize: FONTS.sizes.base,
                  marginBottom: SPACING['2xl'],
                }}
              >
                Start your AI research journey today
              </Text>
            </Animated.View>

            {/* Form */}
            <Animated.View entering={FadeInDown.duration(600).delay(200)}>
              <AnimatedInput
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                leftIcon="person-outline"
                error={errors.fullName}
              />

              <AnimatedInput
                label="Email Address"
                value={email}
                onChangeText={setEmail}
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

              <AnimatedInput
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                isPassword
                leftIcon="shield-checkmark-outline"
                error={errors.confirmPassword}
              />

              {/* Password requirements hint */}
              <View
                style={{
                  backgroundColor: `${COLORS.primary}10`,
                  borderRadius: RADIUS.md,
                  padding: SPACING.md,
                  marginBottom: SPACING.xl,
                  borderWidth: 1,
                  borderColor: `${COLORS.primary}20`,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                }}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={COLORS.primary}
                  style={{ marginRight: 8, marginTop: 1 }}
                />
                <Text
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: FONTS.sizes.xs,
                    flex: 1,
                    lineHeight: 18,
                  }}
                >
                  Password must be at least 8 characters.{'\n'}
                  After signing up, you will receive a{' '}
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                    verification email
                  </Text>{' '}
                  — verify it before signing in.
                </Text>
              </View>

              <GradientButton
                title="Create Account"
                onPress={handleSignUp}
                loading={loading}
              />

              {/* Sign in link */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginTop: SPACING.xl,
                }}
              >
                <Text
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: FONTS.sizes.base,
                  }}
                >
                  Already have an account?{' '}
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/(auth)/signin')}
                >
                  <Text
                    style={{
                      color: COLORS.primary,
                      fontSize: FONTS.sizes.base,
                      fontWeight: '700',
                    }}
                  >
                    Sign In
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