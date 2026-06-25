// app/(auth)/signup.tsx
// Part 43 — FULL REDESIGN + Google & GitHub OAuth.
// Part 56 — Full theme integration, scrollable, fixed keyboard handling
// Part 57 — Removed background circles, fixed OTP autofill
// Part 58 — OTP rewrite: working autofill, smooth digit flow, correct ref wiring

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Dimensions,
  Keyboard,
  Alert,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInRight,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLinkingURL } from 'expo-linking';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { signInWithOAuth, createSessionFromUrl, isOAuthInProgress } from '../../src/services/oauthService';
import { AnimatedInput } from '../../src/components/common/AnimatedInput';
import { GradientButton } from '../../src/components/common/GradientButton';
import { LoadingOverlay } from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const OTP_LENGTH = 8;
const COOLDOWN_SECS = 60;

// How wide each OTP cell should be — scales to fit any screen with a small gap
const OTP_CELL_SIZE = Math.min(44, (SCREEN_WIDTH - SPACING.xl * 2 - 7 * 8) / 8);

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

// ─── Glassmorphism Card ──────────────────────────────────────────────────────

function GlassCard({ children }: { children: React.ReactNode }) {
  const { version } = useTheme();
  return (
    <Animated.View
      key={`glass-${version}`}
      style={{
        backgroundColor: COLORS.backgroundCard + 'CC',
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: SPACING.md,
        marginBottom: SPACING.md,
        ...SHADOWS.medium,
        shadowOpacity: 0.08,
      }}
    >
      {children}
    </Animated.View>
  );
}

// ─── Social Auth Button ──────────────────────────────────────────────────────

function SocialAuthButton({
  provider,
  onPress,
  loading,
}: {
  provider: 'google' | 'github';
  onPress: () => void;
  loading: boolean;
}) {
  const scale = useSharedValue(1);

  const handlePressIn = () => { scale.value = withTiming(0.97, { duration: 100 }); };
  const handlePressOut = () => { scale.value = withTiming(1, { duration: 100 }); };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getIcon = () =>
    provider === 'google' ? (
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="logo-google" size={22} color="#EA4335" />
      </View>
    ) : (
      <View style={{
        width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FFF', borderRadius: 4,
      }}>
        <Ionicons name="logo-github" size={22} color="#181717" />
      </View>
    );

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={loading}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 12, backgroundColor: COLORS.backgroundCard,
          borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: SPACING.lg,
          borderWidth: 1, borderColor: COLORS.border, width: '100%',
          ...SHADOWS.small, shadowOpacity: 0.05,
        }}
      >
        {getIcon()}
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
          {provider === 'google' ? 'Continue with Google' : 'Continue with GitHub'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Or Divider ──────────────────────────────────────────────────────────────

function OrDivider() {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      marginVertical: SPACING.sm, gap: SPACING.sm,
    }}>
      <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
      <Text style={{
        color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
        fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase',
      }}>
        or continue with email
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
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

// ═══════════════════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════════════════

export default function SignUpScreen() {
  const { session, profile, profileLoading } = useAuth();
  const { version } = useTheme();
  const [step, setStep] = useState<'form' | 'otp'>('form');

  // ── Form state ─────────────────────────────────────────────────────────────
  const [fullName,         setFullName]         = useState('');
  const [email,            setEmail]            = useState('');
  const [password,         setPassword]         = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [formErrors,       setFormErrors]       = useState<{
    fullName?: string; email?: string; password?: string; confirmPassword?: string;
  }>({});

  const [showUnverifiedBanner, setShowUnverifiedBanner] = useState(false);
  const [sendingOtp,           setSendingOtp]           = useState(false);
  const [oauthError,           setOauthError]           = useState('');

  // ── OTP state ──────────────────────────────────────────────────────────────
  const [otp,            setOtp]            = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpFocusIndex,  setOtpFocusIndex]  = useState<number | null>(null);
  const [otpError,       setOtpError]       = useState('');

  // ── Loading / cooldown ─────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [didSignUp, setDidSignUp] = useState(false);

  const [sendCooldown,   setSendCooldown]   = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const sendTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── OAuth URL handler ──────────────────────────────────────────────────────
  const url = useLinkingURL();
  useEffect(() => {
    if (!url) return;
    const isOAuthUrl =
      url.includes('access_token') ||
      url.includes('refresh_token') ||
      url.includes('code=');
    if (!isOAuthUrl) return;
    if (!isOAuthInProgress()) return;

    const handleUrl = async () => {
      setOauthError('');
      const { user, error } = await createSessionFromUrl(url);
      if (error) { setOauthError('Sign in failed. Please try again.'); return; }
      if (!user) return;
      try {
        const { data: profileData } = await supabase
          .from('profiles').select('profile_completed').eq('id', user.id).single();
        if (profileData?.profile_completed) router.replace('/(app)/(tabs)/home');
        else router.replace('/(app)/profile-setup');
      } catch {
        router.replace('/(app)/profile-setup');
      }
    };
    handleUrl();
  }, [url]);

  // ── Navigation after sign-up ───────────────────────────────────────────────
  useEffect(() => {
    if (!didSignUp || !session || profileLoading) return;
    if (profile?.account_status === 'suspended') {
      supabase.auth.signOut().then(() => { setDidSignUp(false); setLoading(false); });
      return;
    }
    setLoading(false);
    setDidSignUp(false);
    if (profile?.profile_completed) router.replace('/(app)/(tabs)/home');
    else router.replace('/(app)/profile-setup');
  }, [didSignUp, session, profile, profileLoading]);

  // ── Timer cleanup ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (sendTimerRef.current)   clearInterval(sendTimerRef.current);
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  const startCooldown = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    timerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
  ) => {
    setter(COOLDOWN_SECS);
    timerRef.current = setInterval(() => {
      setter(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // ── OTP change handler (lifted up so parent can reset it) ──────────────────
  const handleOtpChange = useCallback((digits: string[]) => {
    setOtp(digits);
    setOtpError('');
  }, []);

  // ── Back ───────────────────────────────────────────────────────────────────
  const handleBack = () => {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/onboarding');
  };

  // ── Form validation ────────────────────────────────────────────────────────
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

  // ── OAuth ──────────────────────────────────────────────────────────────────
  const handleOAuth = async (provider: 'google' | 'github') => {
    Keyboard.dismiss();
    setOauthError('');
    setShowUnverifiedBanner(false);
    const result = await signInWithOAuth(provider);
    if (!result.success) {
      if (result.errorType === 'cancelled' || result.errorType === 'pending') return;
      setOauthError(result.error ?? 'Sign in failed. Please try again.');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileData } = await supabase
        .from('profiles').select('profile_completed').eq('id', user.id).single();
      if (profileData?.profile_completed) router.replace('/(app)/(tabs)/home');
      else router.replace('/(app)/profile-setup');
    } catch {
      router.replace('/(app)/profile-setup');
    }
  };

  // ── Email sign up ──────────────────────────────────────────────────────────
  const handleSignUp = async () => {
    Keyboard.dismiss();
    if (!validateForm()) return;
    setShowUnverifiedBanner(false);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
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
    // Reset OTP state before showing OTP screen
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');
    setStep('otp');
  };

  const handleSendOtpForUnverified = async () => {
    if (sendCooldown > 0) return;
    Keyboard.dismiss();
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
        Alert.alert('Already Verified', 'This account is already verified. Please sign in.',
          [{ text: 'Sign In', onPress: () => router.replace('/(auth)/signin') }]);
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

  // ── OTP verify ─────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    Keyboard.dismiss();
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

    if (error) { setOtpError('Invalid or expired code. Please try again.'); return; }
    if (data.user) setDidSignUp(true);
  };

  // ── Resend ─────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    Keyboard.dismiss();
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

  // ═══════════════════════════════════════════════════════════════════════════
  // OTP SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === 'otp') {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <SafeAreaView style={{ flex: 1 }}>
            <LoadingOverlay visible={verifying} message="Verifying code..." />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
            >
              <ScrollView
                contentContainerStyle={{
                  flexGrow: 1,
                  padding: SPACING.xl,
                  justifyContent: 'center',
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Back to form */}
                <TouchableOpacity
                  onPress={() => setStep('form')}
                  style={{ marginBottom: SPACING.lg }}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 14,
                    backgroundColor: COLORS.backgroundCard,
                    borderWidth: 1, borderColor: COLORS.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
                  </View>
                </TouchableOpacity>

                <Animated.View entering={SlideInRight.duration(400)}>
                  {/* Icon */}
                  <View style={{ alignItems: 'center', marginBottom: SPACING.lg }}>
                    <LinearGradient
                      colors={COLORS.gradientPrimary}
                      style={{
                        width: 72, height: 72, borderRadius: 24,
                        alignItems: 'center', justifyContent: 'center',
                        ...SHADOWS.medium, shadowOpacity: 0.3,
                      }}
                    >
                      <Ionicons name="mail-open" size={34} color="#FFF" />
                    </LinearGradient>
                  </View>

                  {/* Heading */}
                  <Text style={{
                    color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                    fontWeight: '700', letterSpacing: 2,
                    textTransform: 'uppercase', marginBottom: SPACING.xs,
                    textAlign: 'center',
                  }}>
                    One Last Step
                  </Text>
                  <Text style={{
                    color: COLORS.textPrimary, fontSize: FONTS.sizes.xl,
                    fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.xs,
                    textAlign: 'center',
                  }}>
                    Verify Email
                  </Text>
                  <Text style={{
                    color: COLORS.textSecondary, fontSize: FONTS.sizes.sm,
                    lineHeight: 22, marginBottom: SPACING.lg, textAlign: 'center',
                  }}>
                    We sent an 8-digit code to{'\n'}
                    <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                      {email.trim().toLowerCase()}
                    </Text>
                  </Text>

                  {/* ── OTP cells + hidden input ── */}
                  <OtpSection
                    otp={otp}
                    focusedIndex={otpFocusIndex}
                    error={otpError}
                    onChange={handleOtpChange}
                    onFocusChange={setOtpFocusIndex}
                  />

                  <View style={{ height: SPACING.sm }} />

                  {/* Info banner */}
                  <View style={{
                    backgroundColor: COLORS.primary + '10',
                    borderRadius: RADIUS.md, padding: SPACING.sm,
                    marginBottom: SPACING.md, borderWidth: 1,
                    borderColor: COLORS.primary + '20',
                    flexDirection: 'row', alignItems: 'flex-start',
                  }}>
                    <Ionicons
                      name="information-circle-outline" size={14}
                      color={COLORS.primary}
                      style={{ marginRight: 6, marginTop: 1 }}
                    />
                    <Text style={{
                      color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
                      flex: 1, lineHeight: 16,
                    }}>
                      The code expires in 1 hour. Check your spam folder if you don't see it.
                    </Text>
                  </View>

                  {/* Verify button */}
                  <GradientButton
                    title="Verify & Continue"
                    onPress={handleVerify}
                    loading={verifying}
                  />

                  {/* Resend */}
                  {resendCooldown > 0 ? (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      justifyContent: 'center', marginTop: SPACING.lg,
                      backgroundColor: COLORS.warning + '15',
                      borderRadius: RADIUS.md, padding: SPACING.sm,
                      borderWidth: 1, borderColor: COLORS.warning + '40', gap: 6,
                    }}>
                      <Ionicons name="time-outline" size={14} color={COLORS.warning} />
                      <Text style={{
                        color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600',
                      }}>
                        Please wait {resendCooldown}s before resending
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handleResend}
                      disabled={resending}
                      style={{
                        alignItems: 'center', marginTop: SPACING.lg,
                        flexDirection: 'row', justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name="refresh-outline" size={14}
                        color={COLORS.textSecondary}
                        style={{ marginRight: 4 }}
                      />
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
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION FORM
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <SafeAreaView style={{ flex: 1 }}>
          <LoadingOverlay
            visible={loading || sendingOtp}
            message={sendingOtp ? 'Sending code...' : 'Creating account...'}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: SPACING.xl,
                paddingTop: SPACING.xl,
                paddingBottom: SPACING.xl,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Back button */}
              <Animated.View entering={FadeIn.duration(400)}>
                <TouchableOpacity onPress={handleBack} style={{ marginBottom: SPACING.md }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 14,
                    backgroundColor: COLORS.backgroundCard,
                    borderWidth: 1, borderColor: COLORS.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* Header */}
              <Animated.View
                entering={FadeInDown.duration(600).delay(100)}
                style={{ alignItems: 'center', marginBottom: SPACING.md }}
              >
                <Text style={{
                  color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                  fontWeight: '700', letterSpacing: 2.5,
                  textTransform: 'uppercase', marginBottom: SPACING.xs,
                }}>
                  New Account
                </Text>
                <Text style={{
                  color: COLORS.textPrimary, fontSize: FONTS.sizes['2xl'],
                  fontWeight: '900', letterSpacing: -0.8, marginBottom: 2,
                  textAlign: 'center',
                }}>
                  Create Account
                </Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center' }}>
                  Start your AI research journey today
                </Text>
              </Animated.View>

              {/* OAuth error banner */}
              {!!oauthError && (
                <Animated.View
                  entering={FadeInDown.duration(300)}
                  style={{
                    backgroundColor: COLORS.error + '12', borderRadius: RADIUS.md,
                    padding: SPACING.sm, marginBottom: SPACING.sm,
                    borderWidth: 1, borderColor: COLORS.error + '35',
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                  }}
                >
                  <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 }}>
                    {oauthError}
                  </Text>
                  <TouchableOpacity onPress={() => setOauthError('')}>
                    <Ionicons name="close" size={14} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </Animated.View>
              )}

              <Animated.View entering={FadeInDown.duration(600).delay(200)}>
                {/* Social OAuth */}
                <SocialAuthButton provider="google" onPress={() => handleOAuth('google')} loading={loading} />
                <View style={{ height: SPACING.xs }} />
                <SocialAuthButton provider="github" onPress={() => handleOAuth('github')} loading={loading} />

                <OrDivider />

                {/* Unverified banner */}
                {showUnverifiedBanner && (
                  <Animated.View
                    entering={FadeInDown.duration(400)}
                    style={{
                      backgroundColor: COLORS.warning + '15', borderRadius: RADIUS.md,
                      padding: SPACING.sm, marginBottom: SPACING.sm,
                      borderWidth: 1, borderColor: COLORS.warning + '40',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.xs }}>
                      <Ionicons name="warning" size={16} color={COLORS.warning} style={{ marginRight: 8, marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 2 }}>
                          Account Already Exists
                        </Text>
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
                          This email is registered but not yet verified. Send a verification code to complete sign up.
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setShowUnverifiedBanner(false)}>
                        <Ionicons name="close" size={14} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                    {sendCooldown > 0 ? (
                      <View style={{
                        backgroundColor: COLORS.warning + '20', borderRadius: RADIUS.sm,
                        paddingVertical: 8, paddingHorizontal: 12,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        gap: 6, marginBottom: SPACING.xs,
                      }}>
                        <Ionicons name="time-outline" size={14} color={COLORS.warning} />
                        <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                          Please wait {sendCooldown}s before resending
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={handleSendOtpForUnverified}
                        disabled={sendingOtp}
                        style={{
                          backgroundColor: COLORS.primary, borderRadius: RADIUS.sm,
                          paddingVertical: 8, paddingHorizontal: 12,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                          gap: 6, marginBottom: SPACING.xs,
                        }}
                      >
                        <Ionicons name="shield-checkmark-outline" size={14} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
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

                {/* Registration form */}
                <GlassCard>
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
                      setOauthError('');
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
                    backgroundColor: COLORS.primary + '10', borderRadius: RADIUS.sm,
                    padding: SPACING.sm, marginBottom: SPACING.md,
                    borderWidth: 1, borderColor: COLORS.primary + '20',
                    flexDirection: 'row', alignItems: 'flex-start',
                  }}>
                    <Ionicons
                      name="information-circle-outline" size={14}
                      color={COLORS.primary}
                      style={{ marginRight: 6, marginTop: 1 }}
                    />
                    <Text style={{
                      color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
                      flex: 1, lineHeight: 16,
                    }}>
                      Password must be at least 8 characters.{'\n'}
                      After signing up, we'll send an{' '}
                      <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                        8-digit code to your email
                      </Text>{' '}
                      to verify your account.
                    </Text>
                  </View>

                  <GradientButton
                    title="Create Account"
                    onPress={handleSignUp}
                    loading={loading}
                  />
                </GlassCard>

                <View style={{
                  flexDirection: 'row', justifyContent: 'center',
                  marginTop: SPACING.xs, marginBottom: SPACING.sm,
                }}>
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>
                    Already have an account?{' '}
                  </Text>
                  <TouchableOpacity onPress={() => router.push('/(auth)/signin')}>
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      Sign In
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
}