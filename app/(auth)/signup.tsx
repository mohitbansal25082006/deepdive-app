// app/(auth)/signup.tsx
// Sign Up — OTP based email verification.
//
// FIXED: When user signs up, goes to OTP screen, presses back without
// verifying, then tries to sign up again with the same email:
// - Previously showed "already registered" alert
// - Now detects unverified account, shows a banner with a
//   "Send Verification Code" button that resends the OTP and
//   transitions to the OTP screen directly

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

export default function SignUpScreen() {
  const [step, setStep] = useState<'form' | 'otp'>('form');

  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formErrors, setFormErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  // Banner shown when account exists but not verified
  const [showUnverifiedBanner, setShowUnverifiedBanner] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // OTP fields
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const otpRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  // Loading
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/onboarding');
    }
  };

  const validateForm = () => {
    const e: typeof formErrors = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (!email) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── STEP 1: Create account ─────────────────────────────────────────────────
  const handleSignUp = async () => {
    if (!validateForm()) return;
    setShowUnverifiedBanner(false);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });

    setLoading(false);

    if (error) {
      const msg = error.message.toLowerCase();

      if (
        msg.includes('already registered') ||
        msg.includes('user already registered') ||
        msg.includes('email address is already') ||
        msg.includes('duplicate')
      ) {
        // Account exists — could be unverified (came back here after pressing back)
        // or a fully verified account. Show the unverified banner which lets them
        // send an OTP. If they're already verified, the sign in screen is also offered.
        setShowUnverifiedBanner(true);
      } else {
        Alert.alert('Sign Up Failed', error.message);
      }
      return;
    }

    // New registration succeeded — OTP sent automatically by Supabase
    setStep('otp');
  };

  // ── Send OTP for existing unverified account ───────────────────────────────
  // Called when user taps "Send Verification Code" in the unverified banner
  const handleSendOtpForUnverified = async () => {
    setSendingOtp(true);
    setShowUnverifiedBanner(false);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });

    setSendingOtp(false);

    if (error) {
      // If resend fails it likely means the account IS already verified
      // Direct them to sign in instead
      if (
        error.message.toLowerCase().includes('already confirmed') ||
        error.message.toLowerCase().includes('already verified')
      ) {
        Alert.alert(
          'Already Verified',
          'This account is already verified. Please sign in.',
          [{ text: 'Sign In', onPress: () => router.replace('/(auth)/signin') }]
        );
      } else {
        Alert.alert('Error', error.message);
        setShowUnverifiedBanner(true);
      }
      return;
    }

    // OTP sent — move to OTP screen
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');
    setStep('otp');
  };

  // ── OTP digit handlers ─────────────────────────────────────────────────────
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

  // ── STEP 2: Verify OTP ─────────────────────────────────────────────────────
  const handleVerify = async () => {
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

  // ── Resend OTP ─────────────────────────────────────────────────────────────
  const handleResend = async () => {
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
  // OTP SCREEN
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
                onPress={() => setStep('form')}
                style={{ marginBottom: SPACING.xl }}
              >
                <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>

              <Animated.View entering={SlideInRight.duration(400)}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={{
                    width: 80, height: 80, borderRadius: 40,
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: SPACING.xl,
                    shadowColor: COLORS.primary,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
                  }}
                >
                  <Ionicons name="mail-open" size={36} color="#FFF" />
                </LinearGradient>

                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600',
                  letterSpacing: 2, textTransform: 'uppercase', marginBottom: SPACING.sm,
                }}>
                  One Last Step
                </Text>
                <Text style={{
                  color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'],
                  fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.sm,
                }}>
                  Verify Email
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
                  title="Verify & Continue"
                  onPress={handleVerify}
                  loading={verifying}
                />

                <TouchableOpacity
                  onPress={handleResend}
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
  // REGISTRATION FORM
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay
          visible={loading || sendingOtp}
          message={sendingOtp ? 'Sending code...' : 'Creating account...'}
        />
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
                New Account
              </Text>
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'],
                fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.sm,
              }}>
                Create Account
              </Text>
              <Text style={{
                color: COLORS.textSecondary, fontSize: FONTS.sizes.base,
                marginBottom: SPACING['2xl'],
              }}>
                Start your AI research journey today
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(600).delay(200)}>

              {/* Unverified account banner */}
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
                  <View style={{
                    flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm,
                  }}>
                    <Ionicons name="warning" size={20} color={COLORS.warning}
                      style={{ marginRight: 10, marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        color: COLORS.warning, fontSize: FONTS.sizes.sm,
                        fontWeight: '700', marginBottom: 4,
                      }}>
                        Account Already Exists
                      </Text>
                      <Text style={{
                        color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18,
                      }}>
                        This email is registered but not yet verified. Send a{' '}
                        <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>
                          verification code
                        </Text>
                        {' '}to your email to complete sign up.
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setShowUnverifiedBanner(false)}
                      style={{ marginLeft: 8 }}
                    >
                      <Ionicons name="close" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Send OTP button */}
                  <TouchableOpacity
                    onPress={handleSendOtpForUnverified}
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
                      marginBottom: SPACING.sm,
                    }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={16} color="#FFF" />
                    <Text style={{
                      color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700',
                    }}>
                      {sendingOtp ? 'Sending Code...' : 'Send Verification Code'}
                    </Text>
                  </TouchableOpacity>

                  {/* Sign in link if they already verified elsewhere */}
                  <TouchableOpacity
                    onPress={() => router.replace('/(auth)/signin')}
                    style={{ alignItems: 'center', paddingTop: 4 }}
                  >
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      Already verified?{' '}
                      <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Sign In</Text>
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              <AnimatedInput
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                leftIcon="person-outline"
                error={formErrors.fullName}
              />
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
                error={formErrors.email}
              />
              <AnimatedInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                isPassword
                leftIcon="lock-closed-outline"
                error={formErrors.password}
              />
              <AnimatedInput
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                isPassword
                leftIcon="shield-checkmark-outline"
                error={formErrors.confirmPassword}
              />

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
                  Password must be at least 8 characters.{'\n'}
                  After signing up, we'll send an{' '}
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                    8-digit code to your email
                  </Text>
                  {' '}— enter it in the next screen to verify your account.
                </Text>
              </View>

              <GradientButton title="Create Account" onPress={handleSignUp} loading={loading} />

              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.xl }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base }}>
                  Already have an account?{' '}
                </Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/signin')}>
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
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