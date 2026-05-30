// app/(auth)/signin.tsx
// Part 43 — FULL REDESIGN + Google & GitHub OAuth.
//
// WHAT'S NEW in Part 43:
//   • Google OAuth sign-in (expo-web-browser + supabase.auth.signInWithOAuth)
//   • GitHub OAuth sign-in (same flow)
//   • Completely redesigned UI: floating orb background, glassmorphism card,
//     animated icon orb, staggered entrance animations, premium typography
//   • SocialAuthButton component handles loading/press-animation per provider
//   • OAuth errors surface as inline banners (not Alerts)
//   • AuthBackground component (shared across all auth screens)
//
// ALL Part 42.1 OTP cooldown logic preserved exactly as-is.
// ALL Part 32 suspension banner logic preserved exactly as-is.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert, TextInput, Linking,
} from 'react-native';
import { router }           from 'expo-router';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, SlideInRight,
} from 'react-native-reanimated';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { supabase }         from '../../src/lib/supabase';
import { signInWithOAuth }  from '../../src/services/oauthService';
import { AnimatedInput }    from '../../src/components/common/AnimatedInput';
import { GradientButton }   from '../../src/components/common/GradientButton';
import { LoadingOverlay }   from '../../src/components/common/LoadingOverlay';
import { SocialAuthButton } from '../../src/components/common/SocialAuthButton';
import { OrDivider }        from '../../src/components/common/OrDivider';
import { AuthBackground }   from '../../src/components/common/AuthBackground';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const OTP_LENGTH     = 8;
const SUPPORT_EMAIL  = 'support@deepdiveai.com';
const COOLDOWN_SECS  = 60;

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



// ─── Glassmorphism card wrapper ────────────────────────────────────────────────
function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor:  'rgba(18,18,42,0.75)',
      borderRadius:     RADIUS.xl,
      borderWidth:      1,
      borderColor:      'rgba(108,99,255,0.18)',
      padding:          SPACING.xl,
      marginBottom:     SPACING.lg,
    }}>
      {children}
    </View>
  );
}

export default function SignInScreen() {
  const [step, setStep] = useState<'signin' | 'otp'>('signin');

  // Sign in fields
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState<{ email?: string; password?: string }>({});

  // Banner states
  const [showUnverifiedBanner, setShowUnverifiedBanner] = useState(false);
  const [showSuspendedBanner,  setShowSuspendedBanner]  = useState(false);
  const [sendingOtp,           setSendingOtp]           = useState(false);

  // OAuth error banner
  const [oauthError, setOauthError] = useState('');

  // Cooldown states (Part 42.1)
  const [sendCooldown,   setSendCooldown]   = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const sendTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // OTP fields
  const [otp,       setOtp]       = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpError,  setOtpError]  = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const otpRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  useEffect(() => {
    return () => {
      if (sendTimerRef.current)   clearInterval(sendTimerRef.current);
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
        if (prev <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/onboarding');
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!email)                            e.email    = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email    = 'Enter a valid email';
    if (!password)                         e.password = 'Password is required';
    else if (password.length < 6)          e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── OAuth handlers (Part 43) ────────────────────────────────────────────────
  const handleOAuth = async (provider: 'google' | 'github') => {
    setOauthError('');
    setShowUnverifiedBanner(false);
    setShowSuspendedBanner(false);

    const result = await signInWithOAuth(provider);

    if (!result.success) {
      if (result.errorType === 'cancelled') return; // User dismissed — no error shown
      setOauthError(result.error ?? 'Sign in failed. Please try again.');
    }
    // On success: AuthContext onAuthStateChange fires → app navigates automatically
  };

  // ── Email sign in ──────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!validate()) return;
    setShowUnverifiedBanner(false);
    setShowSuspendedBanner(false);
    setOauthError('');
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      if (
        error.message.toLowerCase().includes('email not confirmed') ||
        error.message.toLowerCase().includes('email_not_confirmed')
      ) {
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
          .select('profile_completed, account_status')
          .eq('id', data.user.id)
          .single();

        if (profileData?.account_status === 'suspended') {
          await supabase.auth.signOut();
          setLoading(false);
          setShowSuspendedBanner(true);
          return;
        }
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

  const handleSendVerificationOtp = async () => {
    if (sendCooldown > 0) return;
    setSendingOtp(true);
    setShowUnverifiedBanner(false);

    const { error } = await supabase.auth.resend({
      type:  'signup',
      email: email.trim().toLowerCase(),
    });
    setSendingOtp(false);

    if (error) {
      if (isRateLimitError(error.message) || error.status === 429) {
        startCooldown(setSendCooldown, sendTimerRef);
        setShowUnverifiedBanner(true);
        return;
      }
      Alert.alert('Error', error.message);
      setShowUnverifiedBanner(true);
      return;
    }
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');
    setStep('otp');
  };

  const handleOtpChange = (value: string, index: number) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const next  = [...otp];
    next[index] = digit;
    setOtp(next);
    setOtpError('');
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const next      = [...otp];
      next[index - 1] = '';
      setOtp(next);
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) { setOtpError(`Please enter all ${OTP_LENGTH} digits`); return; }
    setOtpError('');
    setVerifying(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type:  'signup',
    });
    setVerifying(false);

    if (error) { setOtpError('Invalid or expired code. Please try again.'); return; }

    if (data.user) {
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('profile_completed, account_status')
          .eq('id', data.user.id)
          .single();

        if (profileData?.account_status === 'suspended') {
          await supabase.auth.signOut();
          setVerifying(false);
          setStep('signin');
          setShowSuspendedBanner(true);
          return;
        }
        if (profileData?.profile_completed) router.replace('/(app)/(tabs)/home');
        else router.replace('/(app)/profile-setup');
      } catch {
        router.replace('/(app)/profile-setup');
      }
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');

    const { error } = await supabase.auth.resend({
      type:  'signup',
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
  // OTP SCREEN (unchanged from Part 42.1, only visual polish added)
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === 'otp') {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <AuthBackground />
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
              <TouchableOpacity onPress={() => setStep('signin')} style={{ marginBottom: SPACING.xl }}>
                <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>

              <Animated.View entering={SlideInRight.duration(400)}>
                {/* OTP icon orb */}
                <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
                  <LinearGradient
                    colors={['#FF6584', '#FF8E53']}
                    style={{
                      width: 80, height: 80, borderRadius: 26,
                      alignItems: 'center', justifyContent: 'center',
                      shadowColor: '#FF6584',
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.45, shadowRadius: 20, elevation: 14,
                    }}
                  >
                    <LinearGradient
                      colors={['rgba(255,255,255,0.28)', 'transparent']}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 26 }}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    />
                    <Ionicons name="shield-checkmark" size={38} color="#FFF" />
                  </LinearGradient>
                </View>

                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                  Verify Account
                </Text>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'], fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.sm }}>
                  Enter Code
                </Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, lineHeight: 24, marginBottom: SPACING.xl }}>
                  We sent an 8-digit code to{'\n'}
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>{email.trim().toLowerCase()}</Text>
                </Text>

                {/* OTP boxes */}
                <View style={{ marginBottom: SPACING.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
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

                {otpError
                  ? <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, marginBottom: SPACING.md, marginLeft: 4 }}>{otpError}</Text>
                  : <View style={{ height: SPACING.md }} />
                }

                <View style={{ backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.xl, borderWidth: 1, borderColor: `${COLORS.primary}20`, flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                    The code expires in 1 hour. Check your spam folder if you don't see it.
                  </Text>
                </View>

                <GradientButton title="Verify & Sign In" onPress={handleVerifyOtp} loading={verifying} />

                {/* Resend — Part 42.1 cooldown logic unchanged */}
                {resendCooldown > 0
                  ? (
                    <Animated.View entering={FadeInDown.duration(300)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.xl, backgroundColor: `${COLORS.warning}15`, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.warning}40`, gap: 8 }}>
                      <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                      <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Please wait {resendCooldown}s before resending</Text>
                    </Animated.View>
                  )
                  : (
                    <TouchableOpacity onPress={handleResendOtp} disabled={resending} style={{ alignItems: 'center', marginTop: SPACING.xl, flexDirection: 'row', justifyContent: 'center' }}>
                      <Ionicons name="refresh-outline" size={16} color={COLORS.textSecondary} style={{ marginRight: 6 }} />
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>
                        {resending ? 'Sending...' : "Didn't receive it? "}
                        {!resending && <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Resend Code</Text>}
                      </Text>
                    </TouchableOpacity>
                  )
                }
              </Animated.View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGN IN SCREEN — Part 43 redesign
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Animated orb background */}
      <AuthBackground />

      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay
          visible={loading || sendingOtp}
          message={sendingOtp ? 'Sending code...' : 'Signing in...'}
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
            {/* Back button */}
            <Animated.View entering={FadeIn.duration(400)}>
              <TouchableOpacity onPress={handleBack} style={{ marginBottom: SPACING.lg }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 14,
                  backgroundColor: 'rgba(108,99,255,0.12)',
                  borderWidth: 1, borderColor: 'rgba(108,99,255,0.22)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Header title */}
            <Animated.View entering={FadeInDown.duration(600).delay(100)} style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: SPACING.xs }}>
                Welcome Back
              </Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'], fontWeight: '900', letterSpacing: -0.8, marginBottom: 4, textAlign: 'center' }}>
                Sign In
              </Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, textAlign: 'center' }}>
                Continue your research journey
              </Text>
            </Animated.View>

            {/* ── Part 32: Suspended banner (unchanged) ──────────────────── */}
            {showSuspendedBanner && (
              <Animated.View entering={FadeInDown.duration(400)} style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.xl, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
                  <Ionicons name="ban" size={20} color="#EF4444" style={{ marginRight: 10, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#EF4444', fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 4 }}>Account Suspended</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>Your account has been suspended. Contact support if you believe this is a mistake.</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowSuspendedBanner(false)} style={{ marginLeft: 8 }}>
                    <Ionicons name="close" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Account%20Suspension%20Review`)}
                  style={{ backgroundColor: '#EF4444', borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Ionicons name="mail-outline" size={16} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Contact Support</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Unverified banner (unchanged) */}
            {showUnverifiedBanner && (
              <Animated.View entering={FadeInDown.duration(400)} style={{ backgroundColor: `${COLORS.warning}15`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.xl, borderWidth: 1, borderColor: `${COLORS.warning}40` }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
                  <Ionicons name="warning" size={20} color={COLORS.warning} style={{ marginRight: 10, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 4 }}>Account Not Verified</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>Your account hasn't been verified yet. We'll send a verification code to your email.</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowUnverifiedBanner(false)} style={{ marginLeft: 8 }}>
                    <Ionicons name="close" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
                {sendCooldown > 0
                  ? (
                    <View style={{ backgroundColor: `${COLORS.warning}20`, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                      <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Please wait {sendCooldown}s before resending</Text>
                    </View>
                  )
                  : (
                    <TouchableOpacity
                      onPress={handleSendVerificationOtp}
                      disabled={sendingOtp}
                      style={{ backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <Ionicons name="shield-checkmark-outline" size={16} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{sendingOtp ? 'Sending Code...' : 'Send Verification Code'}</Text>
                    </TouchableOpacity>
                  )
                }
              </Animated.View>
            )}

            {/* OAuth error banner (Part 43 new) */}
            {!!oauthError && (
              <Animated.View entering={FadeInDown.duration(300)} style={{ backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.xl, borderWidth: 1, borderColor: `${COLORS.error}35`, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
                <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, flex: 1 }}>{oauthError}</Text>
                <TouchableOpacity onPress={() => setOauthError('')}>
                  <Ionicons name="close" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── Social OAuth buttons (Part 43 new) ─────────────────────── */}
            <Animated.View entering={FadeInDown.duration(600).delay(200)}>
              <SocialAuthButton
                provider="google"
                onPress={() => handleOAuth('google')}
                loading={loading}
                style={{ marginBottom: SPACING.md }}
              />
              <SocialAuthButton
                provider="github"
                onPress={() => handleOAuth('github')}
                loading={loading}
              />

              <OrDivider />

              {/* ── Email & password ─────────────────────────────────────── */}
              <GlassCard>
                <AnimatedInput
                  label="Email Address"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setShowUnverifiedBanner(false);
                    setShowSuspendedBanner(false);
                    setOauthError('');
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
                  style={{ alignSelf: 'flex-end', marginBottom: SPACING.xl, marginTop: -4 }}
                >
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>

                <GradientButton title="Sign In" onPress={handleSignIn} loading={loading} />
              </GlassCard>

              {/* Sign up link */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.md }}>
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
    </View>
  );
}