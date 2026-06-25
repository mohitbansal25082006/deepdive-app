// app/(auth)/signin.tsx
// Part 43 — FULL REDESIGN + Google & GitHub OAuth.
// Part 56 — Full theme integration, no scroll, fixed keyboard handling
// Part 57 — Removed background circles, added loading screen

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Linking,
  Dimensions,
  Keyboard,
  Alert,
  TouchableWithoutFeedback,
  ActivityIndicator,
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
  withSequence,
  FadeOut,
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

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const OTP_LENGTH = 8;
const SUPPORT_EMAIL = 'support@deepdiveai.com';
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

// ─── Loading Screen ──────────────────────────────────────────────────────────

function LoadingScreen({ message }: { message: string }) {
  const { version } = useTheme();
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 400 });
    opacity.value = withTiming(1, { duration: 400 });
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <Animated.View style={[style, { alignItems: 'center' }]}>
        {/* Loading orb */}
        <LinearGradient
          colors={COLORS.gradientPrimary}
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            alignItems: 'center',
            justifyContent: 'center',
            ...SHADOWS.medium,
            shadowOpacity: 0.3,
            marginBottom: SPACING.xl,
          }}
        >
          <ActivityIndicator size="large" color="#FFF" />
        </LinearGradient>

        <Text style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.lg,
          fontWeight: '700',
          marginBottom: SPACING.sm,
        }}>
          {message}
        </Text>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
          <View style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: COLORS.primary,
          }} />
          <Text style={{
            color: COLORS.textMuted,
            fontSize: FONTS.sizes.sm,
          }}>
            Please wait a moment
          </Text>
          <View style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: COLORS.primary,
          }} />
        </View>
      </Animated.View>
    </Animated.View>
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
        padding: SPACING.xl,
        marginBottom: SPACING.lg,
        ...SHADOWS.medium,
        shadowOpacity: 0.08,
      }}
    >
      {children}
    </Animated.View>
  );
}

// ─── OTP Input Box ────────────────────────────────────────────────────────────

function OtpInputBox({ 
  value, 
  onChangeText, 
  onKeyPress, 
  index,
  isFocused,
}: { 
  value: string; 
  onChangeText: (text: string) => void; 
  onKeyPress: (e: any) => void;
  index: number;
  isFocused: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onKeyPress={onKeyPress}
      keyboardType="number-pad"
      maxLength={1}
      selectTextOnFocus
      style={{
        width: 48,
        height: 56,
        borderRadius: RADIUS.md,
        backgroundColor: COLORS.backgroundCard,
        borderWidth: value ? 2 : 1.5,
        borderColor: value ? COLORS.primary : isFocused ? COLORS.primary : COLORS.border,
        color: COLORS.textPrimary,
        fontSize: FONTS.sizes.xl,
        fontWeight: '700',
        textAlign: 'center',
        ...SHADOWS.small,
        shadowOpacity: value ? 0.1 : 0,
      }}
    />
  );
}

// ─── Social Auth Button ──────────────────────────────────────────────────────

function SocialAuthButton({ 
  provider, 
  onPress, 
  loading 
}: { 
  provider: 'google' | 'github'; 
  onPress: () => void; 
  loading: boolean;
}) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 100 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getIcon = () => {
    if (provider === 'google') {
      return (
        <View style={{ 
          width: 24, 
          height: 24, 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          <Ionicons name="logo-google" size={22} color="#EA4335" />
        </View>
      );
    } else {
      return (
        <View style={{ 
          width: 24, 
          height: 24, 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: '#FFF',
          borderRadius: 4,
        }}>
          <Ionicons name="logo-github" size={22} color="#181717" />
        </View>
      );
    }
  };

  const getLabel = () => {
    return provider === 'google' ? 'Continue with Google' : 'Continue with GitHub';
  };

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={loading}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          backgroundColor: COLORS.backgroundCard,
          borderRadius: RADIUS.md,
          paddingVertical: 14,
          paddingHorizontal: SPACING.lg,
          borderWidth: 1,
          borderColor: COLORS.border,
          width: '100%',
          ...SHADOWS.small,
          shadowOpacity: 0.05,
        }}
      >
        {getIcon()}
        <Text style={{
          color: COLORS.textPrimary,
          fontSize: FONTS.sizes.sm,
          fontWeight: '600',
        }}>
          {getLabel()}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Or Divider ──────────────────────────────────────────────────────────────

function OrDivider() {
  return (
    <View style={{ 
      flexDirection: 'row', 
      alignItems: 'center', 
      marginVertical: SPACING.md,
      gap: SPACING.md,
    }}>
      <View style={{ 
        flex: 1, 
        height: 1, 
        backgroundColor: COLORS.border 
      }} />
      <Text style={{ 
        color: COLORS.textMuted, 
        fontSize: FONTS.sizes.xs,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        or continue with email
      </Text>
      <View style={{ 
        flex: 1, 
        height: 1, 
        backgroundColor: COLORS.border 
      }} />
    </View>
  );
}

export default function SignInScreen() {
  const { session, profile, profileLoading } = useAuth();
  const { version } = useTheme();
  const [step, setStep] = useState<'signin' | 'otp'>('signin');

  // Sign in fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Banner states
  const [showUnverifiedBanner, setShowUnverifiedBanner] = useState(false);
  const [showSuspendedBanner, setShowSuspendedBanner] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // OAuth error banner
  const [oauthError, setOauthError] = useState('');

  // Cooldown states
  const [sendCooldown, setSendCooldown] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // OTP fields
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [focusedOtpIndex, setFocusedOtpIndex] = useState<number | null>(null);
  const otpRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  const [didSignIn, setDidSignIn] = useState(false);
  const url = useLinkingURL();

  // ─── Navigation effect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!didSignIn) return;
    if (!session) return;
    if (profileLoading) return;

    if (profile?.account_status === 'suspended') {
      supabase.auth.signOut().then(() => {
        setDidSignIn(false);
        setLoading(false);
        setShowLoadingScreen(false);
        setShowSuspendedBanner(true);
      });
      return;
    }

    setLoading(false);
    setShowLoadingScreen(false);
    setDidSignIn(false);

    if (profile?.profile_completed) {
      router.replace('/(app)/(tabs)/home');
    } else {
      router.replace('/(app)/profile-setup');
    }
  }, [didSignIn, session, profile, profileLoading]);

  // ─── OAuth URL handler ────────────────────────────────────────────────────
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
      setShowLoadingScreen(true);
      setLoadingMessage('Verifying OAuth login...');

      const { user, error } = await createSessionFromUrl(url);

      if (error) {
        setShowLoadingScreen(false);
        setOauthError('Sign in failed. Please try again.');
        return;
      }

      if (!user) {
        setShowLoadingScreen(false);
        return;
      }

      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('profile_completed, account_status')
          .eq('id', user.id)
          .single();

        if (profileData?.account_status === 'suspended') {
          await supabase.auth.signOut();
          setShowLoadingScreen(false);
          setShowSuspendedBanner(true);
          return;
        }

        setShowLoadingScreen(false);
        if (profileData?.profile_completed) {
          router.replace('/(app)/(tabs)/home');
        } else {
          router.replace('/(app)/profile-setup');
        }
      } catch {
        setShowLoadingScreen(false);
        router.replace('/(app)/(tabs)/home');
      }
    };

    handleUrl();
  }, [url]);

  // ─── Cleanup timers ──────────────────────────────────────────────────────
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

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/onboarding');
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

  // ─── OAuth handlers ──────────────────────────────────────────────────────
  const handleOAuth = async (provider: 'google' | 'github') => {
    Keyboard.dismiss();
    setOauthError('');
    setShowUnverifiedBanner(false);
    setShowSuspendedBanner(false);

    // Show loading screen with appropriate message
    setShowLoadingScreen(true);
    setLoadingMessage(`Signing in with ${provider === 'google' ? 'Google' : 'GitHub'}...`);

    const result = await signInWithOAuth(provider);

    if (!result.success) {
      setShowLoadingScreen(false);
      if (result.errorType === 'cancelled' || result.errorType === 'pending') return;
      setOauthError(result.error ?? 'Sign in failed. Please try again.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setShowLoadingScreen(false);
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('profile_completed, account_status')
        .eq('id', user.id)
        .single();

      if (profileData?.account_status === 'suspended') {
        await supabase.auth.signOut();
        setShowLoadingScreen(false);
        setShowSuspendedBanner(true);
        return;
      }
      
      setShowLoadingScreen(false);
      if (profileData?.profile_completed) {
        router.replace('/(app)/(tabs)/home');
      } else {
        router.replace('/(app)/profile-setup');
      }
    } catch {
      setShowLoadingScreen(false);
      router.replace('/(app)/(tabs)/home');
    }
  };

  // ─── Email sign in ──────────────────────────────────────────────────────
  const handleSignIn = async () => {
    Keyboard.dismiss();
    if (!validate()) return;
    setShowUnverifiedBanner(false);
    setShowSuspendedBanner(false);
    setOauthError('');

    // Show loading screen
    setShowLoadingScreen(true);
    setLoadingMessage('Signing in...');

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setShowLoadingScreen(false);
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

    setDidSignIn(true);
  };

  const handleSendVerificationOtp = async () => {
    if (sendCooldown > 0) return;
    setSendingOtp(true);
    setShowUnverifiedBanner(false);

    setShowLoadingScreen(true);
    setLoadingMessage('Sending verification code...');

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });
    setSendingOtp(false);
    setShowLoadingScreen(false);

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

  // ─── OTP handlers ────────────────────────────────────────────────────────
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

  const handleVerifyOtp = async () => {
    Keyboard.dismiss();
    const code = otp.join('');
    if (code.length < OTP_LENGTH) { 
      setOtpError(`Please enter all ${OTP_LENGTH} digits`); 
      return; 
    }
    setOtpError('');
    setVerifying(true);

    setShowLoadingScreen(true);
    setLoadingMessage('Verifying code...');

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: 'signup',
    });
    setVerifying(false);
    setShowLoadingScreen(false);

    if (error) { 
      setOtpError('Invalid or expired code. Please try again.'); 
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

    setShowLoadingScreen(true);
    setLoadingMessage('Resending code...');

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });
    setResending(false);
    setShowLoadingScreen(false);

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

  // ─── Dismiss keyboard on outside tap ────────────────────────────────────
  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // OTP SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (step === 'otp') {
    return (
      <>
        {showLoadingScreen && <LoadingScreen message={loadingMessage} />}
        <TouchableWithoutFeedback onPress={dismissKeyboard}>
          <View style={{ flex: 1, backgroundColor: COLORS.background }}>
            <SafeAreaView style={{ flex: 1 }}>
              <LoadingOverlay visible={verifying} message="Verifying code..." />
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
              >
                <View style={{ flex: 1, padding: SPACING.xl, justifyContent: 'center' }}>
                  <TouchableOpacity onPress={() => setStep('signin')} style={{ marginBottom: SPACING.xl }}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
                  </TouchableOpacity>

                  <Animated.View entering={SlideInRight.duration(400)}>
                    <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
                      <LinearGradient
                        colors={COLORS.gradientSecondary}
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 26,
                          alignItems: 'center',
                          justifyContent: 'center',
                          ...SHADOWS.medium,
                          shadowOpacity: 0.3,
                        }}
                      >
                        <Ionicons name="shield-checkmark" size={38} color="#FFF" />
                      </LinearGradient>
                    </View>

                    <Text style={{ 
                      color: COLORS.textMuted, 
                      fontSize: FONTS.sizes.xs, 
                      fontWeight: '700', 
                      letterSpacing: 2, 
                      textTransform: 'uppercase', 
                      marginBottom: SPACING.sm,
                      textAlign: 'center',
                    }}>
                      Verify Account
                    </Text>
                    <Text style={{ 
                      color: COLORS.textPrimary, 
                      fontSize: FONTS.sizes['2xl'], 
                      fontWeight: '800', 
                      letterSpacing: -0.5, 
                      marginBottom: SPACING.sm,
                      textAlign: 'center',
                    }}>
                      Enter Code
                    </Text>
                    <Text style={{ 
                      color: COLORS.textSecondary, 
                      fontSize: FONTS.sizes.base, 
                      lineHeight: 24, 
                      marginBottom: SPACING.xl,
                      textAlign: 'center',
                    }}>
                      We sent an 8-digit code to{'\n'}
                      <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
                        {email.trim().toLowerCase()}
                      </Text>
                    </Text>

                    {/* OTP boxes */}
                    <View style={{ marginBottom: SPACING.md }}>
                      <View style={{ 
                        flexDirection: 'row', 
                        justifyContent: 'center', 
                        gap: 10,
                        marginBottom: SPACING.sm,
                      }}>
                        {otp.slice(0, 4).map((digit, index) => (
                          <OtpInputBox
                            key={index}
                            value={digit}
                            onChangeText={(val) => handleOtpChange(val, index)}
                            onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, index)}
                            index={index}
                            isFocused={focusedOtpIndex === index}
                          />
                        ))}
                      </View>
                      <View style={{ 
                        flexDirection: 'row', 
                        justifyContent: 'center', 
                        gap: 10,
                      }}>
                        {otp.slice(4, 8).map((digit, i) => {
                          const idx = i + 4;
                          return (
                            <OtpInputBox
                              key={idx}
                              value={digit}
                              onChangeText={(val) => handleOtpChange(val, idx)}
                              onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, idx)}
                              index={idx}
                              isFocused={focusedOtpIndex === idx}
                            />
                          );
                        })}
                      </View>
                    </View>

                    {otpError ? (
                      <Text style={{ 
                        color: COLORS.error, 
                        fontSize: FONTS.sizes.xs, 
                        marginBottom: SPACING.md, 
                        textAlign: 'center' 
                      }}>
                        {otpError}
                      </Text>
                    ) : (
                      <View style={{ height: SPACING.md }} />
                    )}

                    <View style={{ 
                      backgroundColor: COLORS.primary + '10', 
                      borderRadius: RADIUS.md, 
                      padding: SPACING.md, 
                      marginBottom: SPACING.xl, 
                      borderWidth: 1, 
                      borderColor: COLORS.primary + '20', 
                      flexDirection: 'row', 
                      alignItems: 'flex-start' 
                    }}>
                      <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} style={{ marginRight: 8, marginTop: 1 }} />
                      <Text style={{ 
                        color: COLORS.textSecondary, 
                        fontSize: FONTS.sizes.xs, 
                        flex: 1, 
                        lineHeight: 18 
                      }}>
                        The code expires in 1 hour. Check your spam folder if you don't see it.
                      </Text>
                    </View>

                    <GradientButton 
                      title="Verify & Sign In" 
                      onPress={handleVerifyOtp} 
                      loading={verifying} 
                    />

                    {resendCooldown > 0 ? (
                      <View style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        marginTop: SPACING.xl,
                        backgroundColor: COLORS.warning + '15', 
                        borderRadius: RADIUS.md, 
                        padding: SPACING.md, 
                        borderWidth: 1, 
                        borderColor: COLORS.warning + '40', 
                        gap: 8 
                      }}>
                        <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                        <Text style={{ 
                          color: COLORS.warning, 
                          fontSize: FONTS.sizes.sm, 
                          fontWeight: '600' 
                        }}>
                          Please wait {resendCooldown}s before resending
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity 
                        onPress={handleResendOtp} 
                        disabled={resending} 
                        style={{ 
                          alignItems: 'center', 
                          marginTop: SPACING.xl, 
                          flexDirection: 'row', 
                          justifyContent: 'center' 
                        }}
                      >
                        <Ionicons name="refresh-outline" size={16} color={COLORS.textSecondary} style={{ marginRight: 6 }} />
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>
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
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGN IN SCREEN — No scroll, full theme integration
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {showLoadingScreen && <LoadingScreen message={loadingMessage} />}
      <TouchableWithoutFeedback onPress={dismissKeyboard}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <SafeAreaView style={{ flex: 1 }}>
            <LoadingOverlay
              visible={loading || sendingOtp}
              message={sendingOtp ? 'Sending code...' : 'Signing in...'}
            />

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
              <View style={{ flex: 1, padding: SPACING.xl, justifyContent: 'center' }}>
                {/* Back button */}
                <Animated.View entering={FadeIn.duration(400)} style={{ position: 'absolute', top: SPACING.xl, left: SPACING.xl }}>
                  <TouchableOpacity onPress={handleBack}>
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
                </Animated.View>

                {/* Header title */}
                <Animated.View entering={FadeInDown.duration(600).delay(100)} style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
                  <Text style={{ 
                    color: COLORS.textMuted, 
                    fontSize: FONTS.sizes.xs, 
                    fontWeight: '700', 
                    letterSpacing: 2.5, 
                    textTransform: 'uppercase', 
                    marginBottom: SPACING.xs 
                  }}>
                    Welcome Back
                  </Text>
                  <Text style={{ 
                    color: COLORS.textPrimary, 
                    fontSize: FONTS.sizes['3xl'], 
                    fontWeight: '900', 
                    letterSpacing: -0.8, 
                    marginBottom: 4, 
                    textAlign: 'center' 
                  }}>
                    Sign In
                  </Text>
                  <Text style={{ 
                    color: COLORS.textSecondary, 
                    fontSize: FONTS.sizes.base, 
                    textAlign: 'center' 
                  }}>
                    Continue your research journey
                  </Text>
                </Animated.View>

                {/* ── Suspended banner ──────────────────────────────────────── */}
                {showSuspendedBanner && (
                  <Animated.View entering={FadeInDown.duration(400)} style={{ 
                    backgroundColor: COLORS.error + '12', 
                    borderRadius: RADIUS.lg, 
                    padding: SPACING.md, 
                    marginBottom: SPACING.md, 
                    borderWidth: 1, 
                    borderColor: COLORS.error + '35' 
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
                      <Ionicons name="ban" size={20} color={COLORS.error} style={{ marginRight: 10, marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 4 }}>
                          Account Suspended
                        </Text>
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>
                          Your account has been suspended. Contact support if you believe this is a mistake.
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setShowSuspendedBanner(false)}>
                        <Ionicons name="close" size={16} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Account%20Suspension%20Review`)}
                      style={{ 
                        backgroundColor: COLORS.error, 
                        borderRadius: RADIUS.md, 
                        paddingVertical: 10, 
                        paddingHorizontal: 16, 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: 8 
                      }}
                    >
                      <Ionicons name="mail-outline" size={16} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                        Contact Support
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {/* ── Unverified banner ────────────────────────────────────── */}
                {showUnverifiedBanner && (
                  <Animated.View entering={FadeInDown.duration(400)} style={{ 
                    backgroundColor: COLORS.warning + '15', 
                    borderRadius: RADIUS.lg, 
                    padding: SPACING.md, 
                    marginBottom: SPACING.md, 
                    borderWidth: 1, 
                    borderColor: COLORS.warning + '40' 
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
                      <Ionicons name="warning" size={20} color={COLORS.warning} style={{ marginRight: 10, marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 4 }}>
                          Account Not Verified
                        </Text>
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>
                          Your account hasn't been verified yet. We'll send a verification code to your email.
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setShowUnverifiedBanner(false)}>
                        <Ionicons name="close" size={16} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                    {sendCooldown > 0 ? (
                      <View style={{ 
                        backgroundColor: COLORS.warning + '20', 
                        borderRadius: RADIUS.md, 
                        paddingVertical: 10, 
                        paddingHorizontal: 16, 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: 8 
                      }}>
                        <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                        <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                          Please wait {sendCooldown}s before resending
                        </Text>
                      </View>
                    ) : (
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
                          gap: 8 
                        }}
                      >
                        <Ionicons name="shield-checkmark-outline" size={16} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                          {sendingOtp ? 'Sending Code...' : 'Send Verification Code'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </Animated.View>
                )}

                {/* ── OAuth error banner ────────────────────────────────────── */}
                {!!oauthError && (
                  <Animated.View entering={FadeInDown.duration(300)} style={{ 
                    backgroundColor: COLORS.error + '12', 
                    borderRadius: RADIUS.lg, 
                    padding: SPACING.md, 
                    marginBottom: SPACING.md, 
                    borderWidth: 1, 
                    borderColor: COLORS.error + '35', 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 10 
                  }}>
                    <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
                    <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, flex: 1 }}>
                      {oauthError}
                    </Text>
                    <TouchableOpacity onPress={() => setOauthError('')}>
                      <Ionicons name="close" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </Animated.View>
                )}

                {/* ── Social OAuth buttons ──────────────────────────────────── */}
                <Animated.View entering={FadeInDown.duration(600).delay(200)}>
                  <SocialAuthButton
                    provider="google"
                    onPress={() => handleOAuth('google')}
                    loading={loading}
                  />
                  <View style={{ height: SPACING.sm }} />
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
                      style={{ alignSelf: 'flex-end', marginBottom: SPACING.lg, marginTop: -4 }}
                    >
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                        Forgot Password?
                      </Text>
                    </TouchableOpacity>

                    <GradientButton 
                      title="Sign In" 
                      onPress={handleSignIn} 
                      loading={loading} 
                    />
                  </GlassCard>

                  {/* Sign up link */}
                  <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.sm }}>
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
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>
    </>
  );
}