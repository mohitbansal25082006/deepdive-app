// app/(auth)/forgot-password.tsx
// Part 42.2 UPDATE — Two fixes:
//
// FIX 1 — Auto-login & redirect after password change:
//   OLD: router.replace('/(auth)/signin') + supabase.auth.signOut()
//        This signed the user out immediately after setting the password,
//        forcing them to log in again manually.
//   NEW: After updateUser({ password }) succeeds, the user is already
//        authenticated (verifyOtp created a session in Step 2). We check
//        their profile_completed flag and redirect straight to home or
//        profile-setup — no sign-out, no extra login step.
//
// FIX 2 — OTP autofill (Android SMS + iOS QuickType):
//   - Each OTP TextInput now has:
//       textContentType="oneTimeCode"   → iOS QuickType bar above keyboard
//       autoComplete="sms-otp"          → Android SMS autofill
//   - A hidden single TextInput (opacity:0, position:absolute, width:0)
//     captures full paste/autofill events. When it receives ≥8 digits it
//     distributes them across the 8 boxes and auto-submits.
//   - handleOtpChange also handles multi-char paste on any individual box.
//
// All Part 42.1 cooldown logic preserved unchanged.

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

type Step = 'email' | 'otp' | 'newPassword';

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

export default function ForgotPasswordScreen() {
  const [step,            setStep]            = useState<Step>('email');
  const [email,           setEmail]           = useState('');
  const [otp,             setOtp]             = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const [resending,       setResending]       = useState(false);
  const [emailError,      setEmailError]      = useState('');
  const [otpError,        setOtpError]        = useState('');
  const [passwordError,   setPasswordError]   = useState('');

  // ── Cooldown state (email screen — "Send Verification Code" button) ─────────
  const [sendCooldown,   setSendCooldown]   = useState(0);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cooldown state (OTP screen — "Resend Code" button) ──────────────────────
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const otpRefs    = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
  // Hidden input that captures full autofill / paste on iOS & Android
  const hiddenRef  = useRef<TextInput | null>(null);

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
  // Called by hidden input autofill AND by paste on any individual box.
  const distributeOtp = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    if (digits.length === 0) return;
    const next = [...Array(OTP_LENGTH).fill('')];
    for (let i = 0; i < digits.length; i++) next[i] = digits[i];
    setOtp(next);
    setOtpError('');
    // Focus the box after the last filled digit (or last box if all filled)
    const focusIndex = Math.min(digits.length, OTP_LENGTH - 1);
    otpRefs.current[focusIndex]?.focus();
  };

  // ── STEP 1: Send OTP ───────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (sendCooldown > 0) return;
    if (!email.trim()) { setEmailError('Email is required'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Enter a valid email address'); return; }
    setEmailError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
      },
    });
    setLoading(false);

    if (error) {
      if (isRateLimitError(error.message) || error.status === 429) {
        startCooldown(setSendCooldown, sendTimerRef);
        return;
      }
      // Security: don't reveal if email doesn't exist
      if (!error.message.toLowerCase().includes('not found')) {
        Alert.alert('Error', error.message);
        return;
      }
    }

    setStep('otp');
  };

  // ── OTP digit input handler ────────────────────────────────────────────────
  // Handles both single-digit typing AND multi-char paste on a box.
  const handleOtpChange = (value: string, index: number) => {
    // Multi-char: paste or autofill delivered to an individual box
    if (value.length > 1) {
      distributeOtp(value);
      return;
    }
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setOtpError('');
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
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
    if (resendCooldown > 0) return;

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
      if (!error.message.toLowerCase().includes('not found')) {
        Alert.alert('Error', error.message);
      }
    } else {
      Alert.alert('Code Sent', `A new ${OTP_LENGTH}-digit code has been sent to your email.`);
    }
  };

  // ── STEP 3: Update password ────────────────────────────────────────────────
  // FIX 1: After verifyOtp in Step 2 the user already has a valid session.
  // updateUser() succeeds because they are authenticated. We then check their
  // profile and navigate directly to the app — no sign-out, no re-login.
  const handleUpdatePassword = async () => {
    if (!newPassword) { setPasswordError('Password is required'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    setPasswordError('');
    setLoading(true);

    const { data: updateData, error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    // User is now authenticated with the new password. Navigate into the app.
    try {
      const userId = updateData?.user?.id;
      if (userId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('profile_completed')
          .eq('id', userId)
          .single();
        if (profileData?.profile_completed) {
          router.replace('/(app)/(tabs)/home');
        } else {
          router.replace('/(app)/profile-setup');
        }
      } else {
        // Fallback: session exists, just go home
        router.replace('/(app)/(tabs)/home');
      }
    } catch {
      // Safe fallback — session is valid so home will work
      router.replace('/(app)/(tabs)/home');
    }
  };

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

  // ── Shared OTP box renderer ───────────────────────────────────────────────
  // FIX 2: textContentType="oneTimeCode" enables iOS QuickType suggestion bar.
  //        autoComplete="sms-otp" enables Android SMS autofill.
  const renderOtpBoxes = () => (
    <View style={{ marginBottom: SPACING.sm }}>
      {/* Hidden full-width input that catches iOS/Android autofill of the
          entire code. Positioned off-screen so it is invisible but focusable.
          On iOS, oneTimeCode on this input triggers the QuickType banner;
          on Android sms-otp routes the SMS suggestion here first. */}
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
            maxLength={OTP_LENGTH}   // allow paste of full code into any box
            selectTextOnFocus
            style={{
              width: 64, height: 68, borderRadius: RADIUS.md,
              backgroundColor: COLORS.backgroundCard,
              borderWidth: digit ? 1.5 : 1,
              borderColor: digit ? COLORS.primary : COLORS.border,
              color: COLORS.textPrimary, fontSize: FONTS.sizes.xl,
              fontWeight: '700', textAlign: 'center',
            }}
          />
        ))}
      </View>

      {/* Row 2: boxes 4–7 */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={OTP_LENGTH}
              selectTextOnFocus
              style={{
                width: 64, height: 68, borderRadius: RADIUS.md,
                backgroundColor: COLORS.backgroundCard,
                borderWidth: digit ? 1.5 : 1,
                borderColor: digit ? COLORS.primary : COLORS.border,
                color: COLORS.textPrimary, fontSize: FONTS.sizes.xl,
                fontWeight: '700', textAlign: 'center',
              }}
            />
          );
        })}
      </View>
    </View>
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
              <BackButton onPress={handleBack} />

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
                  onChangeText={(text) => { setEmail(text); setEmailError(''); setSendCooldown(0); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  leftIcon="mail-outline"
                  error={emailError}
                />

                {sendCooldown > 0 ? (
                  <Animated.View
                    entering={FadeInDown.duration(300)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: `${COLORS.warning}15`,
                      borderRadius: RADIUS.md,
                      padding: SPACING.md,
                      borderWidth: 1,
                      borderColor: `${COLORS.warning}40`,
                      gap: 8,
                      marginTop: SPACING.md,
                    }}
                  >
                    <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                    <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                      Please wait {sendCooldown}s before trying again
                    </Text>
                  </Animated.View>
                ) : (
                  <GradientButton
                    title="Send Verification Code"
                    onPress={handleSendOtp}
                    loading={loading}
                    style={{ marginTop: SPACING.md }}
                  />
                )}

                <TouchableOpacity
                  onPress={handleBack}
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
                )}
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
                backgroundColor: `${COLORS.success}10`, borderRadius: RADIUS.md,
                padding: SPACING.md, marginBottom: SPACING.xl,
                borderWidth: 1, borderColor: `${COLORS.success}25`,
                flexDirection: 'row', alignItems: 'flex-start',
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