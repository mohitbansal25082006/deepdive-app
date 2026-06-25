// app/(auth)/forgot-password.tsx
// Part 43 — UI REDESIGN only. All auth logic from Part 42.2 preserved exactly.
// Part 56 — Full theme integration, no scroll, fixed keyboard handling
// Part 58 — OTP rewrite: working autofill, smooth digit flow, correct ref wiring

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TextInput,
  Dimensions,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/context/ThemeContext';
import { AnimatedInput } from '../../src/components/common/AnimatedInput';
import { GradientButton } from '../../src/components/common/GradientButton';
import { LoadingOverlay } from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const OTP_LENGTH = 8;
const COOLDOWN_SECS = 60;
type Step = 'email' | 'otp' | 'newPassword';

// How wide each OTP cell should be — scales to fit any screen with a small gap
const OTP_CELL_SIZE = Math.min(44, (SCREEN_WIDTH - SPACING.xl * 2 - 7 * 8) / 8);

function isRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('60 seconds') || m.includes('security purposes') || 
         m.includes('rate limit') || m.includes('too many requests') || m.includes('429');
}

// ─── Animated Orb Background ──────────────────────────────────────────────────

function AnimatedOrbBackground({ orbColors = ['rgba(79,172,254,0.18)', 'rgba(0,242,254,0.11)', 'rgba(108,99,255,0.08)'] }: { orbColors?: string[] }) {
  const { version } = useTheme();
  
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <Animated.View
        key={`orb1-${version}`}
        entering={FadeIn.duration(1000)}
        style={{
          position: 'absolute',
          top: -SCREEN_HEIGHT * 0.25,
          right: -SCREEN_WIDTH * 0.2,
          width: SCREEN_WIDTH * 0.8,
          height: SCREEN_WIDTH * 0.8,
          borderRadius: SCREEN_WIDTH * 0.4,
          backgroundColor: orbColors[0] || COLORS.primary + '15',
          transform: [{ rotate: '20deg' }],
        }}
      />
      <Animated.View
        key={`orb2-${version}`}
        entering={FadeIn.duration(1000).delay(200)}
        style={{
          position: 'absolute',
          bottom: -SCREEN_HEIGHT * 0.15,
          left: -SCREEN_WIDTH * 0.25,
          width: SCREEN_WIDTH * 0.7,
          height: SCREEN_WIDTH * 0.7,
          borderRadius: SCREEN_WIDTH * 0.35,
          backgroundColor: orbColors[1] || COLORS.accent + '10',
          transform: [{ rotate: '-15deg' }],
        }}
      />
      <Animated.View
        key={`orb3-${version}`}
        entering={FadeIn.duration(1000).delay(400)}
        style={{
          position: 'absolute',
          top: SCREEN_HEIGHT * 0.4,
          right: -SCREEN_WIDTH * 0.1,
          width: SCREEN_WIDTH * 0.3,
          height: SCREEN_WIDTH * 0.3,
          borderRadius: SCREEN_WIDTH * 0.15,
          backgroundColor: orbColors[2] || COLORS.secondary + '10',
        }}
      />
    </View>
  );
}

// ─── Glassmorphism Card ──────────────────────────────────────────────────────

function GlassCard({ children, borderColor }: { children: React.ReactNode; borderColor?: string }) {
  const { version } = useTheme();
  
  return (
    <Animated.View
      key={`glass-${version}`}
      style={{
        backgroundColor: COLORS.backgroundCard + 'CC',
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: borderColor || COLORS.border,
        padding: SPACING.xl,
        marginBottom: SPACING.md,
        ...SHADOWS.medium,
        shadowOpacity: 0.08,
      }}
    >
      {children}
    </Animated.View>
  );
}

// ─── Step Progress Indicator ──────────────────────────────────────────────────

function StepProgress({ current }: { current: Step }) {
  const steps: Step[] = ['email', 'otp', 'newPassword'];
  const labels = ['Email', 'Verify', 'Password'];
  const currentIdx = steps.indexOf(current);

  return (
    <View style={{ 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center', 
      gap: 0, 
      marginBottom: SPACING.md 
    }}>
      {steps.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <React.Fragment key={step}>
            <View style={{
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: RADIUS.full,
              backgroundColor: isDone
                ? COLORS.success + '25'
                : isActive
                  ? COLORS.primary + '25'
                  : 'transparent',
              borderWidth: 1,
              borderColor: isDone ? COLORS.success + '50' : isActive ? COLORS.primary + '50' : COLORS.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}>
              {isDone && <Ionicons name="checkmark" size={10} color={COLORS.success} />}
              <Text style={{
                color: isDone ? COLORS.success : isActive ? COLORS.primary : COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
                fontWeight: isActive ? '700' : '500',
              }}>
                {labels[i]}
              </Text>
            </View>
            {i < steps.length - 1 && (
              <View style={{ 
                width: 16, 
                height: 1, 
                backgroundColor: i < currentIdx ? COLORS.success + '50' : COLORS.border 
              }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── OTP Section ─────────────────────────────────────────────────────────────
// Architecture:
//   • Single hidden TextInput captures ALL input (keyboard, SMS autofill, paste).
//     It is truly invisible (opacity 0, size 1x1, off-screen) but it IS focused
//     and drives everything.
//   • 8 decorative View/Text cells show the current digit state with highlight.
//   • Tapping any cell re-focuses the hidden input so typing always works.
//   • SMS autofill (textContentType="oneTimeCode" + autoComplete="sms-otp")
//     fires onChangeText on the hidden input which fills all cells at once.
//   • Backspace is tracked via onKeyPress on the hidden input.

interface OtpSectionProps {
  otp: string[];
  focusedIndex: number | null;
  error: string;
  onChange: (digits: string[]) => void;
  onFocusChange: (idx: number | null) => void;
}

function OtpSection({ otp, focusedIndex, error, onChange, onFocusChange }: OtpSectionProps) {
  // The single hidden input that drives everything
  const hiddenRef = useRef<TextInput>(null);

  // Derive a single string value for the hidden input
  const hiddenValue = otp.join('');

  const focusHidden = useCallback(() => {
    hiddenRef.current?.focus();
  }, []);

  // Called by the hidden input on every change (including paste / autofill)
  const handleHiddenChange = useCallback((text: string) => {
    // Strip non-digits, cap at OTP_LENGTH
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    const next = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < digits.length; i++) next[i] = digits[i];
    onChange(next);
  }, [onChange]);

  // Handle backspace on hidden input: remove last filled digit
  const handleHiddenKeyPress = useCallback((key: string) => {
    if (key === 'Backspace') {
      // Find last filled position and clear it
      const next = [...otp];
      for (let i = OTP_LENGTH - 1; i >= 0; i--) {
        if (next[i] !== '') {
          next[i] = '';
          onChange(next);
          break;
        }
      }
    }
  }, [otp, onChange]);

  // Derived: which cell should appear "active" (cursor position)
  const activeCellIndex = Math.min(
    otp.findIndex(d => d === ''),
    OTP_LENGTH - 1,
  );
  // If all filled, highlight last cell
  const cursorIndex = activeCellIndex === -1 ? OTP_LENGTH - 1 : activeCellIndex;

  const isFocused = focusedIndex !== null;

  // Render all 8 cells in a single row
  return (
    <View>
      {/* Hidden master input — captures ALL keystrokes and SMS autofill */}
      <TextInput
        ref={hiddenRef}
        value={hiddenValue}
        onChangeText={handleHiddenChange}
        onKeyPress={({ nativeEvent }) => handleHiddenKeyPress(nativeEvent.key)}
        onFocus={() => onFocusChange(cursorIndex)}
        onBlur={() => onFocusChange(null)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"   // iOS SMS autofill
        autoComplete="sms-otp"          // Android SMS autofill
        maxLength={OTP_LENGTH}
        caretHidden
        style={{
          position: 'absolute',
          opacity: 0,
          width: 1,
          height: 1,
          top: 0,
          left: 0,
          // Keep it technically on-screen so the OS delivers autofill
          // (off-screen via left: -9999 can suppress autofill on some devices)
        }}
      />

      {/* Decorative cells — tapping any refocuses the hidden input */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: SPACING.xs,
      }}>
        {Array.from({ length: OTP_LENGTH }).map((_, i) => {
          const filled  = otp[i] !== '';
          const isActive = isFocused && i === cursorIndex;

          return (
            <TouchableOpacity
              key={i}
              onPress={focusHidden}
              activeOpacity={1}
              style={{
                width: OTP_CELL_SIZE,
                height: OTP_CELL_SIZE + 8,
                borderRadius: RADIUS.md,
                backgroundColor: COLORS.backgroundCard,
                borderWidth: isActive ? 2 : filled ? 2 : 1.5,
                borderColor: isActive
                  ? COLORS.primary
                  : filled
                    ? COLORS.primary + 'AA'
                    : COLORS.border,
                alignItems: 'center',
                justifyContent: 'center',
                // Subtle glow on active cell
                shadowColor: isActive ? COLORS.primary : 'transparent',
                shadowOpacity: isActive ? 0.35 : 0,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: isActive ? 4 : 0,
              }}
            >
              {/* Blinking cursor on the active empty cell */}
              {isActive && !filled ? (
                <View style={{
                  width: 2,
                  height: 22,
                  borderRadius: 1,
                  backgroundColor: COLORS.primary,
                  opacity: 0.9,
                }} />
              ) : (
                <Text style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.lg,
                  fontWeight: '700',
                }}>
                  {otp[i]}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Error */}
      {!!error && (
        <Text style={{
          color: COLORS.error,
          fontSize: FONTS.sizes.xs,
          textAlign: 'center',
          marginTop: 4,
        }}>
          {error}
        </Text>
      )}
    </View>
  );
}

export default function ForgotPasswordScreen() {
  const { version } = useTheme();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpFocusIndex, setOtpFocusIndex] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Cooldown state
  const [sendCooldown, setSendCooldown] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (sendTimerRef.current) clearInterval(sendTimerRef.current);
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

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

  // ── OTP change handler ──────────────────────────────────────────────────────
  const handleOtpChange = useCallback((digits: string[]) => {
    setOtp(digits);
    setOtpError('');
  }, []);

  const handleBack = () => {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/onboarding');
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  // ── STEP 1: Send OTP ───────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    Keyboard.dismiss();
    if (sendCooldown > 0) return;
    if (!email.trim()) { setEmailError('Email is required'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Enter a valid email address'); return; }
    setEmailError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setLoading(false);

    if (error) {
      if (isRateLimitError(error.message) || error.status === 429) {
        startCooldown(setSendCooldown, sendTimerRef);
        return;
      }
      if (!error.message.toLowerCase().includes('not found')) {
        Alert.alert('Error', error.message);
        return;
      }
    }
    // Reset OTP state before showing OTP screen
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');
    setStep('otp');
  };

  // ── STEP 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    Keyboard.dismiss();
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
    if (resendCooldown > 0) return;
    Keyboard.dismiss();
    setResending(true);
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setResending(false);

    if (error) {
      if (isRateLimitError(error.message) || error.status === 429) {
        startCooldown(setResendCooldown, resendTimerRef);
        return;
      }
      if (!error.message.toLowerCase().includes('not found')) Alert.alert('Error', error.message);
    } else {
      Alert.alert('Code Sent', `A new ${OTP_LENGTH}-digit code has been sent to your email.`);
    }
  };

  // ── STEP 3: Update password ───────────────────────────────────────────────
  const handleUpdatePassword = async () => {
    Keyboard.dismiss();
    if (!newPassword) { setPasswordError('Password is required'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    setPasswordError('');
    setLoading(true);

    const { data: updateData, error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) { Alert.alert('Error', error.message); return; }

    try {
      const userId = updateData?.user?.id;
      if (userId) {
        const { data: profileData } = await supabase
          .from('profiles').select('profile_completed').eq('id', userId).single();
        if (profileData?.profile_completed) router.replace('/(app)/(tabs)/home');
        else router.replace('/(app)/profile-setup');
      } else {
        router.replace('/(app)/(tabs)/home');
      }
    } catch {
      router.replace('/(app)/(tabs)/home');
    }
  };

  // ─── Back Button ────────────────────────────────────────────────────────────
  const BackButton = ({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={{ marginBottom: SPACING.md }}>
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: COLORS.backgroundCard,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
      </View>
    </TouchableOpacity>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — EMAIL INPUT
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === 'email') {
    return (
      <TouchableWithoutFeedback onPress={dismissKeyboard}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <AnimatedOrbBackground />
          <SafeAreaView style={{ flex: 1 }}>
            <LoadingOverlay visible={loading} message="Sending code..." />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
              <View style={{ flex: 1, padding: SPACING.xl, justifyContent: 'center' }}>
                <Animated.View entering={FadeIn.duration(400)} style={{ position: 'absolute', top: SPACING.xl, left: SPACING.xl }}>
                  <BackButton onPress={handleBack} />
                </Animated.View>

                <Animated.View entering={FadeInDown.duration(600).delay(100)} style={{ alignItems: 'center' }}>
                  <StepProgress current="email" />
                  <Text style={{ 
                    color: COLORS.textMuted, 
                    fontSize: FONTS.sizes.xs, 
                    fontWeight: '700', 
                    letterSpacing: 2.5, 
                    textTransform: 'uppercase', 
                    marginBottom: SPACING.xs 
                  }}>
                    Account Recovery
                  </Text>
                  <Text style={{ 
                    color: COLORS.textPrimary, 
                    fontSize: FONTS.sizes['2xl'], 
                    fontWeight: '900', 
                    letterSpacing: -0.8, 
                    marginBottom: 4, 
                    textAlign: 'center' 
                  }}>
                    Forgot Password?
                  </Text>
                  <Text style={{ 
                    color: COLORS.textSecondary, 
                    fontSize: FONTS.sizes.sm, 
                    textAlign: 'center', 
                    lineHeight: 22, 
                    marginBottom: SPACING.md 
                  }}>
                    Enter your email and we'll send an <Text style={{ color: COLORS.info, fontWeight: '600' }}>8-digit verification code</Text> to reset your password.
                  </Text>
                </Animated.View>

                <Animated.View entering={FadeInDown.duration(600).delay(200)}>
                  <GlassCard>
                    <AnimatedInput
                      label="Email Address"
                      value={email}
                      onChangeText={(text) => { 
                        setEmail(text); 
                        setEmailError(''); 
                        setSendCooldown(0); 
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      leftIcon="mail-outline"
                      error={emailError}
                    />

                    {sendCooldown > 0 ? (
                      <Animated.View entering={FadeInDown.duration(300)} style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        backgroundColor: COLORS.warning + '15', 
                        borderRadius: RADIUS.md, 
                        padding: SPACING.sm, 
                        borderWidth: 1, 
                        borderColor: COLORS.warning + '40', 
                        gap: 6 
                      }}>
                        <Ionicons name="time-outline" size={14} color={COLORS.warning} />
                        <Text style={{ 
                          color: COLORS.warning, 
                          fontSize: FONTS.sizes.xs, 
                          fontWeight: '600' 
                        }}>
                          Please wait {sendCooldown}s before trying again
                        </Text>
                      </Animated.View>
                    ) : (
                      <GradientButton 
                        title="Send Verification Code" 
                        onPress={handleSendOtp} 
                        loading={loading} 
                      />
                    )}
                  </GlassCard>

                  <TouchableOpacity onPress={handleBack} style={{ alignItems: 'center', marginTop: SPACING.xs }}>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>
                      Remember your password? <Text style={{ color: COLORS.info, fontWeight: '600' }}>Sign In</Text>
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — OTP ENTRY
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === 'otp') {
    return (
      <TouchableWithoutFeedback onPress={dismissKeyboard}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <AnimatedOrbBackground />
          <SafeAreaView style={{ flex: 1 }}>
            <LoadingOverlay visible={loading} message="Verifying code..." />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
              <View style={{ flex: 1, padding: SPACING.xl, justifyContent: 'center' }}>
                <Animated.View entering={FadeIn.duration(400)} style={{ position: 'absolute', top: SPACING.xl, left: SPACING.xl }}>
                  <BackButton onPress={() => setStep('email')} />
                </Animated.View>

                <Animated.View entering={SlideInRight.duration(400)} style={{ alignItems: 'center' }}>
                  <StepProgress current="otp" />
                  <Text style={{ 
                    color: COLORS.textMuted, 
                    fontSize: FONTS.sizes.xs, 
                    fontWeight: '700', 
                    letterSpacing: 2.5, 
                    textTransform: 'uppercase', 
                    marginBottom: SPACING.xs 
                  }}>
                    Check Your Email
                  </Text>
                  <Text style={{ 
                    color: COLORS.textPrimary, 
                    fontSize: FONTS.sizes['2xl'], 
                    fontWeight: '900', 
                    letterSpacing: -0.8, 
                    marginBottom: 4 
                  }}>
                    Enter Code
                  </Text>
                  <Text style={{ 
                    color: COLORS.textSecondary, 
                    fontSize: FONTS.sizes.sm, 
                    textAlign: 'center', 
                    lineHeight: 22, 
                    marginBottom: SPACING.md 
                  }}>
                    We sent an 8-digit code to{'\n'}
                    <Text style={{ color: COLORS.info, fontWeight: '600' }}>{email}</Text>
                  </Text>
                </Animated.View>

                <Animated.View entering={FadeInDown.duration(600).delay(150)}>
                  {/* ── OTP cells + hidden input ── */}
                  <OtpSection
                    otp={otp}
                    focusedIndex={otpFocusIndex}
                    error={otpError}
                    onChange={handleOtpChange}
                    onFocusChange={setOtpFocusIndex}
                  />

                  <View style={{ height: SPACING.sm }} />

                  <View style={{ 
                    backgroundColor: COLORS.primary + '10', 
                    borderRadius: RADIUS.md, 
                    padding: SPACING.sm, 
                    marginBottom: SPACING.md, 
                    borderWidth: 1, 
                    borderColor: COLORS.primary + '20', 
                    flexDirection: 'row', 
                    alignItems: 'flex-start' 
                  }}>
                    <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} style={{ marginRight: 6, marginTop: 1 }} />
                    <Text style={{ 
                      color: COLORS.textSecondary, 
                      fontSize: FONTS.sizes.xs, 
                      flex: 1, 
                      lineHeight: 16 
                    }}>
                      The code expires in 1 hour. Check your spam folder if you don't see it.
                    </Text>
                  </View>

                  <GradientButton 
                    title="Verify Code" 
                    onPress={handleVerifyOtp} 
                    loading={loading} 
                  />

                  {resendCooldown > 0 ? (
                    <Animated.View entering={FadeInDown.duration(300)} style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      marginTop: SPACING.lg,
                      backgroundColor: COLORS.warning + '15', 
                      borderRadius: RADIUS.md, 
                      padding: SPACING.sm, 
                      borderWidth: 1, 
                      borderColor: COLORS.warning + '40', 
                      gap: 6 
                    }}>
                      <Ionicons name="time-outline" size={14} color={COLORS.warning} />
                      <Text style={{ 
                        color: COLORS.warning, 
                        fontSize: FONTS.sizes.xs, 
                        fontWeight: '600' 
                      }}>
                        Please wait {resendCooldown}s before resending
                      </Text>
                    </Animated.View>
                  ) : (
                    <TouchableOpacity 
                      onPress={handleResendOtp} 
                      disabled={resending} 
                      style={{ 
                        alignItems: 'center', 
                        marginTop: SPACING.lg, 
                        flexDirection: 'row', 
                        justifyContent: 'center' 
                      }}
                    >
                      <Ionicons name="refresh-outline" size={14} color={COLORS.textSecondary} style={{ marginRight: 4 }} />
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>
                        {resending ? 'Sending...' : "Didn't receive it? "}
                        {!resending && (
                          <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                            Resend Code
                          </Text>
                        )}
                      </Text>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3 — NEW PASSWORD
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <AnimatedOrbBackground orbColors={['rgba(67,233,123,0.16)', 'rgba(56,249,215,0.10)', 'rgba(79,172,254,0.08)']} />
        <SafeAreaView style={{ flex: 1 }}>
          <LoadingOverlay visible={loading} message="Updating password..." />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            <View style={{ flex: 1, padding: SPACING.xl, justifyContent: 'center' }}>
              <Animated.View entering={FadeIn.duration(400)} style={{ position: 'absolute', top: SPACING.xl, left: SPACING.xl }}>
                <BackButton onPress={() => setStep('otp')} />
              </Animated.View>

              <Animated.View entering={SlideInRight.duration(400)} style={{ alignItems: 'center' }}>
                <StepProgress current="newPassword" />
                <Text style={{ 
                  color: COLORS.textMuted, 
                  fontSize: FONTS.sizes.xs, 
                  fontWeight: '700', 
                  letterSpacing: 2.5, 
                  textTransform: 'uppercase', 
                  marginBottom: SPACING.xs 
                }}>
                  Almost Done
                </Text>
                <Text style={{ 
                  color: COLORS.textPrimary, 
                  fontSize: FONTS.sizes['2xl'], 
                  fontWeight: '900', 
                  letterSpacing: -0.8, 
                  marginBottom: 4 
                }}>
                  New Password
                </Text>
                <Text style={{ 
                  color: COLORS.textSecondary, 
                  fontSize: FONTS.sizes.sm, 
                  textAlign: 'center', 
                  lineHeight: 22, 
                  marginBottom: SPACING.md 
                }}>
                  Create a strong new password for your account.
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInDown.duration(600).delay(150)}>
                <GlassCard borderColor={COLORS.success + '30'}>
                  <AnimatedInput
                    label="New Password"
                    value={newPassword}
                    onChangeText={(text) => { 
                      setNewPassword(text); 
                      setPasswordError(''); 
                    }}
                    isPassword
                    leftIcon="lock-closed-outline"
                  />
                  <AnimatedInput
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChangeText={(text) => { 
                      setConfirmPassword(text); 
                      setPasswordError(''); 
                    }}
                    isPassword
                    leftIcon="shield-checkmark-outline"
                    error={passwordError}
                  />

                  <View style={{ 
                    backgroundColor: COLORS.success + '10', 
                    borderRadius: RADIUS.md, 
                    padding: SPACING.sm, 
                    marginBottom: SPACING.md, 
                    borderWidth: 1, 
                    borderColor: COLORS.success + '25', 
                    flexDirection: 'row', 
                    alignItems: 'flex-start' 
                  }}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.success} style={{ marginRight: 6, marginTop: 1 }} />
                    <Text style={{ 
                      color: COLORS.textSecondary, 
                      fontSize: FONTS.sizes.xs, 
                      flex: 1, 
                      lineHeight: 16 
                    }}>
                      Use at least 8 characters with a mix of letters and numbers.
                    </Text>
                  </View>

                  <GradientButton 
                    title="Save New Password" 
                    onPress={handleUpdatePassword} 
                    loading={loading} 
                  />
                </GlassCard>
              </Animated.View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
}