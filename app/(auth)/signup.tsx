// app/(auth)/signup.tsx
// Part 43 — FULL REDESIGN + Google & GitHub OAuth.
//
// WHAT'S NEW in Part 43:
//   • Google and GitHub OAuth at the top of the form
//   • Completely redesigned UI: animated icon orb, floating orb background,
//     glassmorphism card, staggered entrance animations
//   • OAuth errors surface as inline banner (not Alert)
//   • AuthBackground + SocialAuthButton + OrDivider shared components
//
// ALL Part 42.1 OTP autofill + cooldown logic preserved exactly as-is.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert, TextInput,
} from 'react-native';
import { router }           from 'expo-router';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown, SlideInRight,
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

const OTP_LENGTH    = 8;
const COOLDOWN_SECS = 60;

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

// ─── Icon orb for signup screen (rose/pink gradient) ─────────────────────────



function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: 'rgba(18,18,42,0.75)',
      borderRadius:    RADIUS.xl,
      borderWidth:     1,
      borderColor:     'rgba(255,101,132,0.15)',
      padding:         SPACING.xl,
      marginBottom:    SPACING.lg,
    }}>
      {children}
    </View>
  );
}

export default function SignUpScreen() {
  const [step, setStep] = useState<'form' | 'otp'>('form');

  const [fullName,        setFullName]        = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formErrors,      setFormErrors]      = useState<{
    fullName?: string; email?: string; password?: string; confirmPassword?: string;
  }>({});

  const [showUnverifiedBanner, setShowUnverifiedBanner] = useState(false);
  const [sendingOtp,           setSendingOtp]           = useState(false);
  const [oauthError,           setOauthError]           = useState('');

  // Cooldown state (Part 42.1)
  const [sendCooldown,   setSendCooldown]   = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const sendTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [otp,       setOtp]       = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpError,  setOtpError]  = useState('');
  const otpRefs   = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
  const hiddenRef = useRef<TextInput | null>(null);

  const [loading,   setLoading]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

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
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/onboarding');
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

  // ── OAuth handler (Part 43) ────────────────────────────────────────────────
  const handleOAuth = async (provider: 'google' | 'github') => {
    setOauthError('');
    setShowUnverifiedBanner(false);
    const result = await signInWithOAuth(provider);
    if (!result.success) {
      if (result.errorType === 'cancelled') return;
      setOauthError(result.error ?? 'Sign in failed. Please try again.');
    }
  };

  const handleSignUp = async () => {
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
      if (msg.includes('already registered') || msg.includes('user already registered') || msg.includes('email address is already') || msg.includes('duplicate')) {
        setShowUnverifiedBanner(true);
      } else {
        Alert.alert('Sign Up Failed', error.message);
      }
      return;
    }
    setStep('otp');
  };

  const handleSendOtpForUnverified = async () => {
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
      if (error.message.toLowerCase().includes('already confirmed') || error.message.toLowerCase().includes('already verified')) {
        Alert.alert('Already Verified', 'This account is already verified. Please sign in.', [{ text: 'Sign In', onPress: () => router.replace('/(auth)/signin') }]);
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

  const handleOtpChange = (value: string, index: number) => {
    if (value.length > 1) { distributeOtp(value); return; }
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setOtpError('');
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
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
          .from('profiles').select('profile_completed').eq('id', data.user.id).single();
        if (profileData?.profile_completed) router.replace('/(app)/(tabs)/home');
        else router.replace('/(app)/profile-setup');
      } catch {
        router.replace('/(app)/profile-setup');
      }
    }
  };

  const handleResend = async () => {
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

  const renderOtpBoxes = () => (
    <View style={{ marginBottom: SPACING.sm }}>
      <TextInput
        ref={hiddenRef}
        value=""
        onChangeText={(val) => { const digits = val.replace(/[^0-9]/g, ''); if (digits.length >= OTP_LENGTH) distributeOtp(digits); }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, left: -9999 }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
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
            maxLength={OTP_LENGTH}
            selectTextOnFocus
            style={{ width: 64, height: 68, borderRadius: RADIUS.md, backgroundColor: COLORS.backgroundCard, borderWidth: digit ? 1.5 : 1, borderColor: digit ? COLORS.primary : COLORS.border, color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '700', textAlign: 'center' }}
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
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={OTP_LENGTH}
              selectTextOnFocus
              style={{ width: 64, height: 68, borderRadius: RADIUS.md, backgroundColor: COLORS.backgroundCard, borderWidth: digit ? 1.5 : 1, borderColor: digit ? COLORS.primary : COLORS.border, color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '700', textAlign: 'center' }}
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
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <AuthBackground orbColors={['rgba(255,101,132,0.18)', 'rgba(240,147,251,0.12)', 'rgba(108,99,255,0.08)']} />
        <SafeAreaView style={{ flex: 1 }}>
          <LoadingOverlay visible={verifying} message="Verifying code..." />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TouchableOpacity onPress={() => setStep('form')} style={{ marginBottom: SPACING.xl }}>
                <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,101,132,0.10)', borderWidth: 1, borderColor: 'rgba(255,101,132,0.20)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
                </View>
              </TouchableOpacity>

              <Animated.View entering={SlideInRight.duration(400)}>
                <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{ width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 14 }}
                  >
                    <LinearGradient colors={['rgba(255,255,255,0.28)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 26 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                    <Ionicons name="mail-open" size={38} color="#FFF" />
                  </LinearGradient>
                </View>

                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: SPACING.sm }}>One Last Step</Text>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'], fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.sm }}>Verify Email</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, lineHeight: 24, marginBottom: SPACING.xl }}>
                  We sent an 8-digit code to{'\n'}
                  <Text style={{ color: COLORS.primary, fontWeight: '600' }}>{email.trim().toLowerCase()}</Text>
                </Text>

                {renderOtpBoxes()}

                {otpError
                  ? <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, marginBottom: SPACING.md, marginLeft: 4 }}>{otpError}</Text>
                  : <View style={{ height: SPACING.md }} />
                }

                <View style={{ backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.xl, borderWidth: 1, borderColor: `${COLORS.primary}20`, flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>The code expires in 1 hour. Check your spam folder if you don't see it.</Text>
                </View>

                <GradientButton title="Verify & Continue" onPress={handleVerify} loading={verifying} />

                {resendCooldown > 0
                  ? (
                    <Animated.View entering={FadeInDown.duration(300)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.xl, backgroundColor: `${COLORS.warning}15`, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.warning}40`, gap: 8 }}>
                      <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                      <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Please wait {resendCooldown}s before resending</Text>
                    </Animated.View>
                  )
                  : (
                    <TouchableOpacity onPress={handleResend} disabled={resending} style={{ alignItems: 'center', marginTop: SPACING.xl, flexDirection: 'row', justifyContent: 'center' }}>
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
  // REGISTRATION FORM — Part 43 redesign
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <AuthBackground orbColors={['rgba(255,101,132,0.18)', 'rgba(240,147,251,0.12)', 'rgba(108,99,255,0.08)']} />
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay visible={loading || sendingOtp} message={sendingOtp ? 'Sending code...' : 'Creating account...'} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Back button */}
            <Animated.View entering={FadeIn.duration(400)}>
              <TouchableOpacity onPress={handleBack} style={{ marginBottom: SPACING.lg }}>
                <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,101,132,0.10)', borderWidth: 1, borderColor: 'rgba(255,101,132,0.20)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(600).delay(100)} style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: SPACING.xs }}>New Account</Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes['3xl'], fontWeight: '900', letterSpacing: -0.8, marginBottom: 4, textAlign: 'center' }}>Create Account</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, textAlign: 'center' }}>Start your AI research journey today</Text>
            </Animated.View>

            {/* OAuth error banner */}
            {!!oauthError && (
              <Animated.View entering={FadeInDown.duration(300)} style={{ backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.xl, borderWidth: 1, borderColor: `${COLORS.error}35`, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
                <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, flex: 1 }}>{oauthError}</Text>
                <TouchableOpacity onPress={() => setOauthError('')}><Ionicons name="close" size={16} color={COLORS.textMuted} /></TouchableOpacity>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.duration(600).delay(200)}>
              {/* Social OAuth (Part 43) */}
              <SocialAuthButton provider="google" onPress={() => handleOAuth('google')} loading={loading} style={{ marginBottom: SPACING.md }} />
              <SocialAuthButton provider="github" onPress={() => handleOAuth('github')} loading={loading} />

              <OrDivider />

              {/* Unverified banner */}
              {showUnverifiedBanner && (
                <Animated.View entering={FadeInDown.duration(400)} style={{ backgroundColor: `${COLORS.warning}15`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.xl, borderWidth: 1, borderColor: `${COLORS.warning}40` }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
                    <Ionicons name="warning" size={20} color={COLORS.warning} style={{ marginRight: 10, marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 4 }}>Account Already Exists</Text>
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>This email is registered but not yet verified. Send a verification code to complete sign up.</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowUnverifiedBanner(false)} style={{ marginLeft: 8 }}><Ionicons name="close" size={16} color={COLORS.textMuted} /></TouchableOpacity>
                  </View>
                  {sendCooldown > 0
                    ? (
                      <View style={{ backgroundColor: `${COLORS.warning}20`, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: SPACING.sm }}>
                        <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                        <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Please wait {sendCooldown}s before resending</Text>
                      </View>
                    )
                    : (
                      <TouchableOpacity onPress={handleSendOtpForUnverified} disabled={sendingOtp} style={{ backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: SPACING.sm }}>
                        <Ionicons name="shield-checkmark-outline" size={16} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{sendingOtp ? 'Sending Code...' : 'Send Verification Code'}</Text>
                      </TouchableOpacity>
                    )
                  }
                  <TouchableOpacity onPress={() => router.replace('/(auth)/signin')} style={{ alignItems: 'center', paddingTop: 4 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Already verified? <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Sign In</Text></Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* Registration form in glassmorphism card */}
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
                  onChangeText={(text) => { setEmail(text); setShowUnverifiedBanner(false); setOauthError(''); }}
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

                <View style={{ backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.xl, borderWidth: 1, borderColor: `${COLORS.primary}20`, flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 18 }}>
                    Password must be at least 8 characters.{'\n'}
                    After signing up, we'll send an <Text style={{ color: COLORS.primary, fontWeight: '600' }}>8-digit code to your email</Text> to verify your account.
                  </Text>
                </View>

                <GradientButton title="Create Account" onPress={handleSignUp} loading={loading} variant="secondary" />
              </GlassCard>

              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.md }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base }}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/signin')}>
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}