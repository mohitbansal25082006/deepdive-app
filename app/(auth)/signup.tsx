// app/(auth)/signup.tsx
// Part 42.2 UPDATE — OTP autofill fix.
//
// FIX — OTP autofill (Android SMS + iOS QuickType):
//   - Each OTP TextInput now has:
//       textContentType="oneTimeCode"   → iOS QuickType bar above keyboard
//       autoComplete="sms-otp"          → Android SMS autofill
//       maxLength={OTP_LENGTH}          → allows full paste into any box
//   - A hidden single TextInput (opacity:0, absolute, off-screen) catches the
//     full autofill value first. When it receives ≥8 digits it distributes
//     them across the 8 boxes and focuses the last filled box.
//   - handleOtpChange handles multi-char paste on any individual visible box.
//   - distributeOtp() is the single function that fills all boxes from
//     any full code string.
//
// All Part 42.1 cooldown logic and all Part 1–42.1 logic preserved unchanged.

import React, { useState, useRef, useEffect } from 'react';
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

const OTP_LENGTH    = 8;
const COOLDOWN_SECS = 60;

// ── Helper: detect rate-limit errors from Supabase ───────────────────────────
function isRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('60 seconds') ||
    m.includes('security purposes') ||
    m.includes('rate limit') ||
    m.includes('too many requests') ||
    m.includes('429')
  );
}

export default function SignUpScreen() {
  const [step, setStep] = useState<'form' | 'otp'>('form');

  // Form fields
  const [fullName,         setFullName]         = useState('');
  const [email,            setEmail]            = useState('');
  const [password,         setPassword]         = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [formErrors,       setFormErrors]       = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  // Banner shown when account exists but not verified
  const [showUnverifiedBanner, setShowUnverifiedBanner] = useState(false);
  const [sendingOtp,           setSendingOtp]           = useState(false);

  // ── Cooldown state (form screen — "Send Verification Code" button) ──────────
  const [sendCooldown,   setSendCooldown]   = useState(0);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cooldown state (OTP screen — "Resend Code" button) ──────────────────────
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // OTP fields
  const [otp,       setOtp]       = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpError,  setOtpError]  = useState('');
  const otpRefs   = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
  // Hidden input for full-code autofill capture
  const hiddenRef = useRef<TextInput | null>(null);

  // Loading
  const [loading,   setLoading]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (sendTimerRef.current)   clearInterval(sendTimerRef.current);
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  // ── Start a countdown timer ───────────────────────────────────────────────
  const startCooldown = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    timerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>
  ) => {
    setter(COOLDOWN_SECS);
    timerRef.current = setInterval(() => {
      setter(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Distribute a full OTP string across the 8 boxes ──────────────────────
  const distributeOtp = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    if (digits.length === 0) return;
    const next = [...Array(OTP_LENGTH).fill('')];
    for (let i = 0; i < digits.length; i++) next[i] = digits[i];
    setOtp(next);
    setOtpError('');
    const focusIndex = Math.min(digits.length, OTP_LENGTH - 1);
    otpRefs.current[focusIndex]?.focus();
  };

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

      if (isRateLimitError(error.message) || error.status === 429) {
        startCooldown(setSendCooldown, sendTimerRef);
        setShowUnverifiedBanner(true);
        return;
      }

      if (
        msg.includes('already registered') ||
        msg.includes('user already registered') ||
        msg.includes('email address is already') ||
        msg.includes('duplicate')
      ) {
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
  const handleSendOtpForUnverified = async () => {
    if (sendCooldown > 0) return;

    setSendingOtp(true);
    setShowUnverifiedBanner(false);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });

    setSendingOtp(false);

    if (error) {
      if (isRateLimitError(error.message) || error.status === 429) {
        startCooldown(setSendCooldown, sendTimerRef);
        setShowUnverifiedBanner(true);
        return;
      }

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

    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');
    setStep('otp');
  };

  // ── OTP digit handlers ─────────────────────────────────────────────────────
  // FIX: handles both single-digit typing AND multi-char paste/autofill
  const handleOtpChange = (value: string, index: number) => {
    // Multi-char: paste or autofill delivered directly to a visible box
    if (value.length > 1) {
      distributeOtp(value);
      return;
    }
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
    if (resendCooldown > 0) return;

    setResending(true);
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });

    setResending(false);

    if (error) {
      if (isRateLimitError(error.message) || error.status === 429) {
        startCooldown(setResendCooldown, resendTimerRef);
        return;
      }
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Code Sent!', `A new code has been sent to ${email.trim().toLowerCase()}.`);
    }
  };

  // ── OTP boxes with autofill support ───────────────────────────────────────
  // FIX 2: hidden input + textContentType/autoComplete on every box
  const renderOtpBoxes = () => (
    <View style={{ marginBottom: SPACING.sm }}>
      {/* Hidden input that catches the full autofill value from iOS/Android.
          - iOS: textContentType="oneTimeCode" makes the QuickType bar show
            the code from the email above the keyboard.
          - Android: autoComplete="sms-otp" makes GBoard suggest the OTP
            from the SMS. The suggestion is delivered to whichever input
            has focus — we route it here via off-screen positioning.
          The input is invisible but still part of the layout so the OS
          can deliver the autofill payload to it. */}
      <TextInput
        ref={hiddenRef}
        value=""
        onChangeText={(val) => {
          const digits = val.replace(/[^0-9]/g, '');
          if (digits.length >= OTP_LENGTH) {
            distributeOtp(digits);
          }
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        style={{
          position: 'absolute',
          opacity: 0,
          width: 1,
          height: 1,
          left: -9999,
        }}
      />

      {/* Row 1: boxes 0–3 */}
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
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={OTP_LENGTH}   // allow a full paste into any single box
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

      {/* Row 2: boxes 4–7 */}
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
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={OTP_LENGTH}
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
  );

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

                {/* FIX 2: OTP boxes with autofill support */}
                {renderOtpBoxes()}

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

                {resendCooldown > 0 ? (
                  <Animated.View
                    entering={FadeInDown.duration(300)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: SPACING.xl,
                      backgroundColor: `${COLORS.warning}15`,
                      borderRadius: RADIUS.md,
                      padding: SPACING.md,
                      borderWidth: 1,
                      borderColor: `${COLORS.warning}40`,
                      gap: 8,
                    }}
                  >
                    <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                    <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                      Please wait {resendCooldown}s before resending
                    </Text>
                  </Animated.View>
                ) : (
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
                )}
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

                  {sendCooldown > 0 ? (
                    <View style={{
                      backgroundColor: `${COLORS.warning}20`,
                      borderRadius: RADIUS.md,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      marginBottom: SPACING.sm,
                    }}>
                      <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                      <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                        Please wait {sendCooldown}s before resending
                      </Text>
                    </View>
                  ) : (
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
                  )}

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