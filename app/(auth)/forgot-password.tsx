// app/(auth)/forgot-password.tsx
// Forgot Password — OTP code based flow.
// FIXED: OTP box count changed from 6 to 8 to match Supabase's default
//        8-digit OTP code length.
//
// STEP 1: User enters email → signInWithOtp sends 8-digit code to email
// STEP 2: User enters the 8-digit code → verifyOtp validates it
// STEP 3: User enters new password + confirm → updateUser saves it

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

// Supabase sends 8-digit OTP codes by default
const OTP_LENGTH = 8;

type Step = 'email' | 'otp' | 'newPassword';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');

  // 8 individual digit boxes
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Refs for each OTP digit box for auto-focus
  const otpRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  // ── STEP 1: Send OTP ───────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!email.trim()) { setEmailError('Email is required'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Enter a valid email address'); return; }
    setEmailError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false, // don't create account if email doesn't exist
      },
    });
    setLoading(false);

    // Even if error says user not found, move forward (security — don't reveal if email exists)
    if (error && !error.message.toLowerCase().includes('not found')) {
      Alert.alert('Error', error.message);
      return;
    }

    setStep('otp');
  };

  // ── OTP digit input handler ────────────────────────────────────────────────
  const handleOtpChange = (value: string, index: number) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setOtpError('');

    // Auto-focus next box when digit is entered
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    // Move back on backspace when box is empty
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      otpRefs.current[index - 1]?.focus();
    }
  };

  // ── STEP 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const otpCode = otp.join('');
    if (otpCode.length < OTP_LENGTH) {
      setOtpError(`Please enter all ${OTP_LENGTH} digits`);
      return;
    }
    setOtpError('');
    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otpCode,
      type: 'email',
    });
    setLoading(false);

    if (error) {
      setOtpError('Invalid or expired code. Please check and try again.');
      return;
    }

    setStep('newPassword');
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    setResending(true);
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setResending(false);

    if (error && !error.message.toLowerCase().includes('not found')) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Code Sent', `A new ${OTP_LENGTH}-digit code has been sent to your email.`);
    }
  };

  // ── STEP 3: Update password ────────────────────────────────────────────────
  const handleUpdatePassword = async () => {
    if (!newPassword) { setPasswordError('Password is required'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    setPasswordError('');
    setLoading(true);

    // updateUser writes the new password to the database
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    // Sign out so user logs in fresh with the new password.
    // Navigate BEFORE signOut to avoid any lock contention.
    // We call signOut in the background — the user is already being redirected.
    router.replace('/(auth)/signin');

    // Small delay so navigation fires first, then sign out in the background
    setTimeout(() => {
      supabase.auth.signOut();
    }, 300);
  };

  // Safe back: goes back if possible, otherwise goes to onboarding
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/onboarding');
    }
  };

  const BackButton = ({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={{ marginBottom: SPACING.xl }}>
      <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — EMAIL INPUT
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === 'email') {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <LoadingOverlay visible={loading} message="Sending code..." />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }}
              keyboardShouldPersistTaps="handled"
            >
              <BackButton onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace('//(auth)/onboarding'); } }} />

              <Animated.View entering={FadeIn.duration(600)}>
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
                  <Ionicons name="key" size={36} color="#FFF" />
                </LinearGradient>

                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600',
                  letterSpacing: 2, textTransform: 'uppercase', marginBottom: SPACING.sm,
                }}>
                  Account Recovery
                </Text>
                <Text style={{
                  color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'],
                  fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.sm,
                }}>
                  Forgot Password?
                </Text>
                <Text style={{
                  color: COLORS.textSecondary, fontSize: FONTS.sizes.base,
                  lineHeight: 24, marginBottom: SPACING['2xl'],
                }}>
                  Enter your email and we'll send you an{' '}
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                    8-digit verification code
                  </Text>
                  {' '}to reset your password.
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInDown.duration(600).delay(200)}>
                <AnimatedInput
                  label="Email Address"
                  value={email}
                  onChangeText={(text) => { setEmail(text); setEmailError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  leftIcon="mail-outline"
                  error={emailError}
                />

                <GradientButton
                  title="Send Verification Code"
                  onPress={handleSendOtp}
                  loading={loading}
                  style={{ marginTop: SPACING.md }}
                />

                <TouchableOpacity
                  onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace('//(auth)/onboarding'); } }}
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — 8-DIGIT OTP ENTRY
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === 'otp') {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <LoadingOverlay visible={loading} message="Verifying code..." />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }}
              keyboardShouldPersistTaps="handled"
            >
              <BackButton onPress={() => setStep('email')} />

              <Animated.View entering={SlideInRight.duration(400)}>
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
                  <Ionicons name="mail-open" size={36} color="#FFF" />
                </LinearGradient>

                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600',
                  letterSpacing: 2, textTransform: 'uppercase', marginBottom: SPACING.sm,
                }}>
                  Check Your Email
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
                    {email}
                  </Text>
                </Text>

                {/* 8-digit OTP boxes — split into two rows of 4 for better fit */}
                <View style={{ marginBottom: SPACING.sm }}>
                  {/* Row 1 — digits 0-3 */}
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
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
                          width: 64,
                          height: 68,
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

                  {/* Row 2 — digits 4-7 */}
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}>
                    {otp.slice(4, 8).map((digit, index) => {
                      const actualIndex = index + 4;
                      return (
                        <TextInput
                          key={actualIndex}
                          ref={(ref) => { otpRefs.current[actualIndex] = ref; }}
                          value={digit}
                          onChangeText={(val) => handleOtpChange(val, actualIndex)}
                          onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, actualIndex)}
                          keyboardType="number-pad"
                          maxLength={1}
                          selectTextOnFocus
                          style={{
                            width: 64,
                            height: 68,
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

                {/* OTP error */}
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

                {/* Hint */}
                <View style={{
                  backgroundColor: `${COLORS.primary}10`,
                  borderRadius: RADIUS.md,
                  padding: SPACING.md,
                  marginBottom: SPACING.xl,
                  borderWidth: 1,
                  borderColor: `${COLORS.primary}20`,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                }}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.primary}
                    style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={{
                    color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
                    flex: 1, lineHeight: 18,
                  }}>
                    The code expires in 1 hour. Check your spam folder if you don't see it.
                  </Text>
                </View>

                <GradientButton
                  title="Verify Code"
                  onPress={handleVerifyOtp}
                  loading={loading}
                />

                {/* Resend */}
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
  // STEP 3 — NEW PASSWORD
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay visible={loading} message="Updating password..." />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={SlideInRight.duration(400)}>
              <LinearGradient
                colors={COLORS.gradientSuccess}
                style={{
                  width: 80, height: 80, borderRadius: 40,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: SPACING.xl,
                  shadowColor: COLORS.success,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
                }}
              >
                <Ionicons name="lock-open" size={36} color="#FFF" />
              </LinearGradient>

              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600',
                letterSpacing: 2, textTransform: 'uppercase', marginBottom: SPACING.sm,
              }}>
                Almost Done
              </Text>
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'],
                fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.sm,
              }}>
                New Password
              </Text>
              <Text style={{
                color: COLORS.textSecondary, fontSize: FONTS.sizes.base,
                lineHeight: 24, marginBottom: SPACING['2xl'],
              }}>
                Create a strong new password for your account.
              </Text>

              <AnimatedInput
                label="New Password"
                value={newPassword}
                onChangeText={(text) => { setNewPassword(text); setPasswordError(''); }}
                isPassword
                leftIcon="lock-closed-outline"
              />

              <AnimatedInput
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={(text) => { setConfirmPassword(text); setPasswordError(''); }}
                isPassword
                leftIcon="shield-checkmark-outline"
                error={passwordError}
              />

              <View style={{
                backgroundColor: `${COLORS.success}10`,
                borderRadius: RADIUS.md,
                padding: SPACING.md,
                marginBottom: SPACING.xl,
                borderWidth: 1,
                borderColor: `${COLORS.success}25`,
                flexDirection: 'row',
                alignItems: 'flex-start',
              }}>
                <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success}
                  style={{ marginRight: 8, marginTop: 1 }} />
                <Text style={{
                  color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
                  flex: 1, lineHeight: 18,
                }}>
                  Use at least 8 characters with a mix of letters and numbers.
                </Text>
              </View>

              <GradientButton
                title="Save New Password"
                onPress={handleUpdatePassword}
                loading={loading}
                variant="success"
              />
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}