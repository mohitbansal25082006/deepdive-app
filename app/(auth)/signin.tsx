// app/(auth)/signin.tsx
// Sign In screen.
// UPDATED: When user tries to sign in with an unverified account,
// instead of showing "resend verification email" we now:
// 1. Show a banner explaining they need to verify with a code
// 2. Offer a button that resends the OTP and shows the OTP input screen
// 3. After OTP verified → navigate to profile-setup or home directly

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { AnimatedInput } from '../../src/components/common/AnimatedInput';
import { GradientButton } from '../../src/components/common/GradientButton';
import { LoadingOverlay } from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const OTP_LENGTH = 8;

export default function SignInScreen() {
  // 'signin' = normal login form
  // 'otp'    = OTP verification screen (shown when email not confirmed)
  const [step, setStep] = useState<'signin' | 'otp'>('signin');

  // Sign in fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [showUnverifiedBanner, setShowUnverifiedBanner] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // OTP fields
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const otpRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/onboarding');
    }
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!email) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Sign In ────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!validate()) return;
    setShowUnverifiedBanner(false);
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
        // Show the unverified banner instead of old "resend email" approach
        setShowUnverifiedBanner(true);
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
        router.replace('/(app)/(tabs)/home');
      }
    }

    setLoading(false);
  };

  // ── Send OTP to unverified account ────────────────────────────────────────
  // Called when user taps "Send Verification Code" in the banner
  const handleSendVerificationOtp = async () => {
    setSendingOtp(true);
    setShowUnverifiedBanner(false);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });

    setSendingOtp(false);

    if (error) {
      Alert.alert('Error', error.message);
      setShowUnverifiedBanner(true);
      return;
    }

    // OTP sent — show the OTP input screen
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');
    setStep('otp');
  };

  // ── OTP digit handlers ────────────────────────────────────────────────────
  const handleOtpChange = (value: string, index: number) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setOtpError('');
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      otpRefs.current[index - 1]?.focus();
    }
  };

  // ── Verify OTP ────────────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) {
      setOtpError(`Please enter all ${OTP_LENGTH} digits`);
      return;
    }
    setOtpError('');
    setVerifying(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: 'signup',
    });

    setVerifying(false);

    if (error) {
      setOtpError('Invalid or expired code. Please try again.');
      return;
    }

    // Verified — sign them in and navigate
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
        router.replace('/(app)/profile-setup');
      }
    }
  };

  // ── Resend OTP from OTP screen ────────────────────────────────────────────
  const handleResendOtp = async () => {
    setResending(true);
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });

    setResending(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Code Sent!', `A new code has been sent to ${email.trim().toLowerCase()}.`);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // OTP VERIFICATION SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === 'otp') {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <LoadingOverlay visible={verifying} message="Verifying code..." />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                onPress={() => setStep('signin')}
                style={{ marginBottom: SPACING.xl }}
              >
                <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>

              <Animated.View entering={SlideInRight.duration(400)}>
                {/* Icon */}
                <LinearGradient
                  colors={['#FF6584', '#FF8E53']}
                  style={{
                    width: 80, height: 80, borderRadius: 40,
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: SPACING.xl,
                    shadowColor: '#FF6584',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
                  }}
                >
                  <Ionicons name="shield-checkmark" size={36} color="#FFF" />
                </LinearGradient>

                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600',
                  letterSpacing: 2, textTransform: 'uppercase', marginBottom: SPACING.sm,
                }}>
                  Verify Account
                </Text>
                <Text style={{
                  color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'],
                  fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.sm,
                }}>
                  Enter Code
                </Text>
                <Text style={{
                  color: COLORS.textSecondary, fontSize: FONTS.sizes.base,
                  lineHeight: 24, marginBottom: SPACING.xl,
                }}>
                  We sent an 8-digit code to{'\n'}
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                    {email.trim().toLowerCase()}
                  </Text>
                </Text>

                {/* OTP boxes — 2 rows of 4 */}
                <View style={{ marginBottom: SPACING.sm }}>
                  <View style={{
                    flexDirection: 'row', justifyContent: 'space-between',
                    marginBottom: SPACING.sm,
                  }}>
                    {otp.slice(0, 4).map((digit, index) => (
                      <TextInput
                        key={index}
                        ref={(ref) => { otpRefs.current[index] = ref; }}
                        value={digit}
                        onChangeText={(val) => handleOtpChange(val, index)}
                        onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, index)}
                        keyboardType="number-pad"
                        maxLength={1}
                        selectTextOnFocus
                        style={{
                          width: 64, height: 68,
                          borderRadius: RADIUS.md,
                          backgroundColor: COLORS.backgroundCard,
                          borderWidth: digit ? 1.5 : 1,
                          borderColor: digit ? COLORS.primary : COLORS.border,
                          color: COLORS.textPrimary,
                          fontSize: FONTS.sizes.xl,
                          fontWeight: '700',
                          textAlign: 'center',
                        }}
                      />
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {otp.slice(4, 8).map((digit, i) => {
                      const idx = i + 4;
                      return (
                        <TextInput
                          key={idx}
                          ref={(ref) => { otpRefs.current[idx] = ref; }}
                          value={digit}
                          onChangeText={(val) => handleOtpChange(val, idx)}
                          onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, idx)}
                          keyboardType="number-pad"
                          maxLength={1}
                          selectTextOnFocus
                          style={{
                            width: 64, height: 68,
                            borderRadius: RADIUS.md,
                            backgroundColor: COLORS.backgroundCard,
                            borderWidth: digit ? 1.5 : 1,
                            borderColor: digit ? COLORS.primary : COLORS.border,
                            color: COLORS.textPrimary,
                            fontSize: FONTS.sizes.xl,
                            fontWeight: '700',
                            textAlign: 'center',
                          }}
                        />
                      );
                    })}
                  </View>
                </View>

                {otpError ? (
                  <Text style={{
                    color: COLORS.error, fontSize: FONTS.sizes.xs,
                    marginBottom: SPACING.md, marginLeft: 4,
                  }}>
                    {otpError}
                  </Text>
                ) : (
                  <View style={{ height: SPACING.md }} />
                )}

                <View style={{
                  backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.md,
                  padding: SPACING.md, marginBottom: SPACING.xl,
                  borderWidth: 1, borderColor: `${COLORS.primary}20`,
                  flexDirection: 'row', alignItems: 'flex-start',
                }}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.primary}
                    style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={{
                    color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18,
                  }}>
                    The code expires in 1 hour. Check your spam folder if you don't see it.
                  </Text>
                </View>

                <GradientButton
                  title="Verify & Sign In"
                  onPress={handleVerifyOtp}
                  loading={verifying}
                />

                <TouchableOpacity
                  onPress={handleResendOtp}
                  disabled={resending}
                  style={{
                    alignItems: 'center', marginTop: SPACING.xl,
                    flexDirection: 'row', justifyContent: 'center',
                  }}
                >
                  <Ionicons name="refresh-outline" size={16} color={COLORS.textSecondary}
                    style={{ marginRight: 6 }} />
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>
                    {resending ? 'Sending...' : "Didn't receive it? "}
                    {!resending && (
                      <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Resend Code</Text>
                    )}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGN IN SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay visible={loading || sendingOtp} message={sendingOtp ? 'Sending code...' : 'Signing in...'} />

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

            {/* Account not verified banner — new OTP style */}
            {showUnverifiedBanner && (
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={{
                  backgroundColor: `${COLORS.warning}15`,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.md,
                  marginBottom: SPACING.xl,
                  borderWidth: 1,
                  borderColor: `${COLORS.warning}40`,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
                  <Ionicons name="warning" size={20} color={COLORS.warning}
                    style={{ marginRight: 10, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: COLORS.warning, fontSize: FONTS.sizes.sm,
                      fontWeight: '700', marginBottom: 4,
                    }}>
                      Account Not Verified
                    </Text>
                    <Text style={{
                      color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18,
                    }}>
                      Your account hasn't been verified yet. We'll send a{' '}
                      <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>
                        6-digit verification code
                      </Text>
                      {' '}to your email to complete verification.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowUnverifiedBanner(false)}
                    style={{ marginLeft: 8 }}
                  >
                    <Ionicons name="close" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleSendVerificationOtp}
                  disabled={sendingOtp}
                  style={{
                    backgroundColor: COLORS.primary,
                    borderRadius: RADIUS.md,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Ionicons name="shield-checkmark-outline" size={16} color="#FFF" />
                  <Text style={{
                    color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700',
                  }}>
                    {sendingOtp ? 'Sending Code...' : 'Send Verification Code'}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.duration(600).delay(200)}>
              <AnimatedInput
                label="Email Address"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setShowUnverifiedBanner(false);
                }}
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
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginHorizontal: SPACING.md,
                }}>
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