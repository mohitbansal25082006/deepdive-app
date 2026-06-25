// app/(app)/profile-setup.tsx
// Profile Setup — shown ONLY ONCE to new users after registration.
// FIXED: Duplicate username shows "Username already taken" instead of raw DB error.
// UPGRADED: Full theme integration with animated transitions and modern UI
// FIXED: Step 3 content now displays correctly
// FIXED: pickImage function reference error

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useProfile } from '../../src/hooks/useProfile';
import { AnimatedInput } from '../../src/components/common/AnimatedInput';
import { GradientButton } from '../../src/components/common/GradientButton';
import { LoadingOverlay } from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useTheme } from '../../src/context/ThemeContext';

const INTEREST_OPTIONS = [
  'Technology', 'Science', 'Business', 'Finance', 'Health',
  'Politics', 'Environment', 'AI & ML', 'Startups', 'Research',
  'Education', 'Sports', 'Entertainment', 'Travel', 'Food',
];

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: SPACING.md }}>
      {Array.from({ length: totalSteps }).map((_, index) => {
        const isActive = index + 1 === currentStep;
        const isCompleted = index + 1 < currentStep;
        return (
          <View
            key={index}
            style={{
              width: isActive ? 32 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isCompleted || isActive ? COLORS.primary : COLORS.border,
              opacity: isActive ? 1 : isCompleted ? 0.8 : 0.3,
            }}
          />
        );
      })}
    </View>
  );
}

// ─── Interest Chip ────────────────────────────────────────────────────────────

function InterestChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const scale = useSharedValue(1);

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.92, { duration: 100 }),
      withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) }),
    );
    onToggle();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: RADIUS.full,
          backgroundColor: selected ? COLORS.primary : COLORS.backgroundCard,
          borderWidth: 1.5,
          borderColor: selected ? COLORS.primary : COLORS.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          ...SHADOWS.small,
          shadowOpacity: selected ? 0.2 : 0,
        }}
      >
        {selected && <Ionicons name="checkmark-circle" size={14} color="#FFF" />}
        <Text style={{
          color: selected ? '#FFFFFF' : COLORS.textSecondary,
          fontSize: FONTS.sizes.sm,
          fontWeight: selected ? '600' : '400',
        }}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Avatar Picker ────────────────────────────────────────────────────────────

function AvatarPicker({
  avatarUri,
  onPickImage,
}: {
  avatarUri: string | null;
  onPickImage: () => void;
}) {
  const scale = useSharedValue(1);
  const pulse = useSharedValue(1);

  React.useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000 }),
        withTiming(1, { duration: 2000 }),
      ),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.92, { duration: 150 }),
      withSpring(1, { damping: 12, stiffness: 150 }),
    );
    onPickImage();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <Animated.View style={animatedStyle}>
        {avatarUri ? (
          <View>
            <Image
              source={{ uri: avatarUri }}
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                borderWidth: 4,
                borderColor: COLORS.primary,
                ...SHADOWS.medium,
              }}
            />
            <Animated.View style={[{
              position: 'absolute',
              bottom: 4,
              right: 4,
              backgroundColor: COLORS.primary,
              borderRadius: 20,
              padding: 10,
              borderWidth: 2,
              borderColor: COLORS.background,
              ...SHADOWS.small,
            }, pulseStyle]}>
              <Ionicons name="camera" size={20} color="#FFF" />
            </Animated.View>
          </View>
        ) : (
          <View style={{
            width: 140,
            height: 140,
            borderRadius: 70,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: COLORS.border,
            borderStyle: 'dashed',
            backgroundColor: COLORS.backgroundCard,
            ...SHADOWS.medium,
            shadowOpacity: 0.1,
          }}>
            <Ionicons name="person-add-outline" size={48} color={COLORS.textMuted} />
            <Text style={{
              color: COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              marginTop: 8,
              fontWeight: '500',
            }}>
              Tap to upload
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Step content components ──────────────────────────────────────────────────

function Step1Content({
  username, setUsername,
  occupation, setOccupation,
  bio, setBio,
  errors, setErrors,
}: any) {
  return (
    <View>
      <Text style={[stepStyles.title, { color: COLORS.textPrimary }]}>
        Basic Information
      </Text>
      <Text style={[stepStyles.subtitle, { color: COLORS.textSecondary }]}>
        Let's start with the basics
      </Text>

      <AnimatedInput
        label="Username"
        value={username}
        onChangeText={(text: string) => {
          setUsername(text.toLowerCase().replace(/\s/g, ''));
          setErrors({});
        }}
        autoCapitalize="none"
        autoCorrect={false}
        leftIcon="at"
        error={errors.username}
        placeholder="Choose a unique username"
        returnKeyType="next"
      />

      <AnimatedInput
        label="Occupation (optional)"
        value={occupation}
        onChangeText={setOccupation}
        leftIcon="briefcase-outline"
        placeholder="e.g., Software Engineer, Student"
        returnKeyType="next"
      />

      <AnimatedInput
        label="Bio (optional)"
        value={bio}
        onChangeText={setBio}
        leftIcon="document-text-outline"
        multiline
        numberOfLines={3}
        placeholder="Tell us a bit about yourself..."
        style={{
          minHeight: 80,
          textAlignVertical: 'top',
        }}
        returnKeyType="done"
        blurOnSubmit
      />
    </View>
  );
}

function Step2Content({ avatarUri, onPickImage }: any) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[stepStyles.title, { color: COLORS.textPrimary, textAlign: 'center' }]}>
        Profile Photo
      </Text>
      <Text style={[stepStyles.subtitle, { color: COLORS.textSecondary, textAlign: 'center' }]}>
        Add a photo to personalise your profile
      </Text>

      <AvatarPicker avatarUri={avatarUri} onPickImage={onPickImage} />

      <View style={{
        marginTop: SPACING.xl,
        padding: SPACING.md,
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        width: '100%',
      }}>
        <Text style={{
          color: COLORS.textMuted,
          fontSize: FONTS.sizes.xs,
          textAlign: 'center',
          lineHeight: 18,
        }}>
          💡 Tip: A clear, professional photo helps build trust with other researchers
        </Text>
      </View>
    </View>
  );
}

function Step3Content({ selectedInterests, toggleInterest }: any) {
  return (
    <View>
      <Text style={[stepStyles.title, { color: COLORS.textPrimary }]}>
        Your Interests
      </Text>
      <Text style={[stepStyles.subtitle, { color: COLORS.textSecondary }]}>
        Select topics you want to research. This helps personalise your experience.
      </Text>

      <View style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: SPACING.md,
      }}>
        {INTEREST_OPTIONS.map((interest) => (
          <InterestChip
            key={interest}
            label={interest}
            selected={selectedInterests.includes(interest)}
            onToggle={() => toggleInterest(interest)}
          />
        ))}
      </View>

      {selectedInterests.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={{
            marginTop: SPACING.lg,
            padding: SPACING.md,
            backgroundColor: COLORS.primary + '10',
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderColor: COLORS.primary + '20',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{
            color: COLORS.primary,
            fontSize: FONTS.sizes.sm,
            fontWeight: '600',
          }}>
            {selectedInterests.length} interest{selectedInterests.length !== 1 ? 's' : ''} selected
          </Text>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
        </Animated.View>
      )}
    </View>
  );
}

// ─── Step Transition Component ──────────────────────────────────────────────

function StepTransition({ step, children }: { step: number; children: React.ReactNode }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    // Animate in when step changes
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    translateY.value = withSpring(0, { damping: 18, stiffness: 120, mass: 0.8 });
    
    // Cleanup function to reset animation values when unmounting
    return () => {
      opacity.value = 0;
      translateY.value = 20;
    };
  }, [step]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ProfileSetupScreen() {
  const { user, refreshProfile } = useAuth();
  const { updateProfile, uploadAvatar, updating, uploading } = useProfile();
  const { version } = useTheme();

  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [occupation, setOccupation] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ username?: string }>({});
  const scrollViewRef = useRef<ScrollView>(null);

  const totalSteps = 3;

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest],
    );
  };

  const validateStep1 = () => {
    const newErrors: typeof errors = {};
    if (!username.trim()) {
      newErrors.username = 'Username is required';
    } else if (username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-z0-9_]+$/.test(username.toLowerCase())) {
      newErrors.username = 'Only letters, numbers, and underscores allowed';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleComplete = async () => {
    if (!user) return;

    let avatarUrl: string | null = null;
    if (avatarUri) {
      const { url, error } = await uploadAvatar(user.id, avatarUri);
      if (error) { Alert.alert('Upload Error', error); return; }
      avatarUrl = url;
    }

    const { error } = await updateProfile(user.id, {
      username: username.trim().toLowerCase(),
      bio: bio.trim() || null,
      occupation: occupation.trim() || null,
      interests: selectedInterests.length > 0 ? selectedInterests : null,
      avatar_url: avatarUrl,
      profile_completed: true,
    });

    if (error) {
      if (
        error.toLowerCase().includes('duplicate key') ||
        error.toLowerCase().includes('unique constraint') ||
        error.toLowerCase().includes('profiles_username_key')
      ) {
        setStep(1);
        setErrors({ username: 'This username is already taken. Please choose another.' });
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        Alert.alert('Error', error);
      }
      return;
    }

    await refreshProfile();
    router.replace('/(app)/(tabs)/home');
  };

  const scrollToTop = () => scrollViewRef.current?.scrollTo({ y: 0, animated: true });

  const handleNext = () => {
    Keyboard.dismiss();
    if (step === 1) {
      if (validateStep1()) { setStep(2); scrollToTop(); }
    } else if (step === 2) {
      setStep(3); scrollToTop();
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    Keyboard.dismiss();
    if (step > 1) { setStep(step - 1); scrollToTop(); }
  };

  const getStepTitle = (): string => {
    switch (step) {
      case 1: return 'Basic Information';
      case 2: return 'Profile Photo';
      case 3: return 'Your Interests';
      default: return '';
    }
  };

  const getStepIcon = (): React.ComponentProps<typeof Ionicons>['name'] => {
    switch (step) {
      case 2: return 'camera-outline';
      case 3: return 'bulb-outline';
      default: return 'person-outline';
    }
  };

  // Render the appropriate step content
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <Step1Content
            username={username}
            setUsername={setUsername}
            occupation={occupation}
            setOccupation={setOccupation}
            bio={bio}
            setBio={setBio}
            errors={errors}
            setErrors={setErrors}
          />
        );
      case 2:
        return <Step2Content avatarUri={avatarUri} onPickImage={pickImage} />;
      case 3:
        return (
          <Step3Content
            selectedInterests={selectedInterests}
            toggleInterest={toggleInterest}
          />
        );
      default:
        return null;
    }
  };

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundElevated]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <LoadingOverlay visible={updating || uploading} message="Setting up your profile..." />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: SPACING.xl,
              paddingTop: SPACING.lg,
              paddingBottom: Platform.OS === 'android' ? SPACING['2xl'] : SPACING.lg,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            horizontal={false}
            alwaysBounceHorizontal={false}
            overScrollMode="never"
          >
            {/* Header — static, never part of the step animation */}
            <Animated.View
              entering={FadeIn.duration(600)}
              style={{ marginBottom: SPACING.xl }}
            >
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: SPACING.lg,
              }}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                    ...SHADOWS.medium,
                    shadowOpacity: 0.2,
                  }}
                >
                  <Ionicons name={getStepIcon()} size={24} color="#FFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: COLORS.textPrimary,
                    fontSize: FONTS.sizes.lg,
                    fontWeight: '700',
                  }}>
                    {getStepTitle()}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                    Step {step} of {totalSteps}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={{
                height: 4,
                backgroundColor: COLORS.border,
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    height: 4,
                    borderRadius: 2,
                    width: `${(step / totalSteps) * 100}%`,
                  }}
                />
              </View>

              <StepIndicator currentStep={step} totalSteps={totalSteps} />
            </Animated.View>

            {/* Step content with transition */}
            <StepTransition step={step}>
              {renderStepContent()}
            </StepTransition>

            {/* Navigation buttons */}
            <Animated.View
              entering={FadeInDown.duration(400).delay(100)}
              style={{ marginTop: SPACING['2xl'] }}
            >
              <GradientButton
                title={step === totalSteps ? 'Complete Setup 🎉' : 'Continue →'}
                onPress={handleNext}
                loading={updating || uploading}
              />

              <View style={{
                flexDirection: 'row',
                justifyContent: 'center',
                gap: SPACING.lg,
                marginTop: SPACING.md,
              }}>
                {step > 1 && (
                  <TouchableOpacity onPress={handleBack} style={{ padding: SPACING.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="arrow-back" size={16} color={COLORS.textSecondary} />
                      <Text style={{
                        color: COLORS.textSecondary,
                        fontSize: FONTS.sizes.base,
                        fontWeight: '500',
                      }}>
                        Back
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {step >= 2 && step < totalSteps && (
                  <TouchableOpacity
                    onPress={() => { Keyboard.dismiss(); setStep(step + 1); scrollToTop(); }}
                    style={{ padding: SPACING.sm }}
                  >
                    <Text style={{
                      color: COLORS.textMuted,
                      fontSize: FONTS.sizes.base,
                      fontWeight: '500',
                    }}>
                      Skip →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── Shared step text styles ──────────────────────────────────────────────────

const stepStyles = {
  title: {
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '800' as const,
    marginBottom: SPACING.sm,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONTS.sizes.base,
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
};