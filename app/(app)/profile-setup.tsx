// app/(app)/profile-setup.tsx
// Profile Setup — shown ONLY ONCE to new users after registration.
// FIXED: Duplicate username shows "Username already taken" instead of raw DB error.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInRight,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useProfile } from '../../src/hooks/useProfile';
import { AnimatedInput } from '../../src/components/common/AnimatedInput';
import { GradientButton } from '../../src/components/common/GradientButton';
import { LoadingOverlay } from '../../src/components/common/LoadingOverlay';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const INTEREST_OPTIONS = [
  'Technology', 'Science', 'Business', 'Finance', 'Health',
  'Politics', 'Environment', 'AI & ML', 'Startups', 'Research',
  'Education', 'Sports', 'Entertainment', 'Travel', 'Food',
];

export default function ProfileSetupScreen() {
  const { user, refreshProfile } = useAuth();
  const { updateProfile, uploadAvatar, updating, uploading } = useProfile();

  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [occupation, setOccupation] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ username?: string }>({});

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
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
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

    // Upload avatar if selected
    if (avatarUri) {
      const { url, error } = await uploadAvatar(user.id, avatarUri);
      if (error) {
        Alert.alert('Upload Error', error);
        return;
      }
      avatarUrl = url;
    }

    // Save profile to database
    const { error } = await updateProfile(user.id, {
      username: username.trim().toLowerCase(),
      bio: bio.trim() || null,
      occupation: occupation.trim() || null,
      interests: selectedInterests.length > 0 ? selectedInterests : null,
      avatar_url: avatarUrl,
      profile_completed: true,
    });

    if (error) {
      // ── FIXED: Catch duplicate username DB error and show friendly message ──
      // Supabase returns "duplicate key value violates unique constraint"
      // when the username is already taken. We catch that and show a clear
      // message instead of the raw database error.
      if (
        error.toLowerCase().includes('duplicate key') ||
        error.toLowerCase().includes('unique constraint') ||
        error.toLowerCase().includes('profiles_username_key')
      ) {
        // Go back to step 1 and show the error under the username field
        setStep(1);
        setErrors({ username: 'This username is already taken. Please choose another.' });
      } else {
        Alert.alert('Error', error);
      }
      return;
    }

    await refreshProfile();
    router.replace('/(app)/(tabs)/home');
  };

  // ── STEP 1: Basic info ──────────────────────────────────────────────────────
  const renderStep1 = () => (
    <Animated.View entering={SlideInRight.duration(400)}>
      <Text style={styles.stepTitle}>Basic Information</Text>
      <Text style={styles.stepSubtitle}>Let's start with the basics</Text>

      <AnimatedInput
        label="Username"
        value={username}
        onChangeText={(text) => {
          setUsername(text.toLowerCase().replace(/\s/g, ''));
          setErrors({});
        }}
        autoCapitalize="none"
        leftIcon="at"
        error={errors.username}
      />

      <AnimatedInput
        label="Occupation (optional)"
        value={occupation}
        onChangeText={setOccupation}
        leftIcon="briefcase-outline"
      />

      <AnimatedInput
        label="Bio (optional)"
        value={bio}
        onChangeText={setBio}
        leftIcon="document-text-outline"
        multiline
        numberOfLines={3}
      />
    </Animated.View>
  );

  // ── STEP 2: Profile photo ───────────────────────────────────────────────────
  const renderStep2 = () => (
    <Animated.View entering={SlideInRight.duration(400)} style={{ alignItems: 'center' }}>
      <Text style={styles.stepTitle}>Profile Photo</Text>
      <Text style={styles.stepSubtitle}>
        Add a photo to personalise your profile
      </Text>

      <TouchableOpacity onPress={pickImage} style={{ marginVertical: SPACING.xl }}>
        {avatarUri ? (
          <View>
            <Image
              source={{ uri: avatarUri }}
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                borderWidth: 3,
                borderColor: COLORS.primary,
              }}
            />
            <View style={{
              position: 'absolute', bottom: 4, right: 4,
              backgroundColor: COLORS.primary, borderRadius: 20, padding: 8,
            }}>
              <Ionicons name="camera" size={18} color="#FFF" />
            </View>
          </View>
        ) : (
          <LinearGradient
            colors={['#1A1A35', '#12122A']}
            style={{
              width: 140, height: 140, borderRadius: 70,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: COLORS.border,
              borderStyle: 'dashed',
            }}
          >
            <Ionicons name="camera-outline" size={40} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>
              Tap to upload
            </Text>
          </LinearGradient>
        )}
      </TouchableOpacity>

      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center' }}>
        You can skip this step and add a photo later
      </Text>
    </Animated.View>
  );

  // ── STEP 3: Interests ───────────────────────────────────────────────────────
  const renderStep3 = () => (
    <Animated.View entering={SlideInRight.duration(400)}>
      <Text style={styles.stepTitle}>Your Interests</Text>
      <Text style={styles.stepSubtitle}>
        Select topics you want to research. This helps personalise your experience.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.md }}>
        {INTEREST_OPTIONS.map((interest) => {
          const isSelected = selectedInterests.includes(interest);
          return (
            <TouchableOpacity
              key={interest}
              onPress={() => toggleInterest(interest)}
              style={{
                margin: 4,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: RADIUS.full,
                backgroundColor: isSelected ? COLORS.primary : COLORS.backgroundCard,
                borderWidth: 1,
                borderColor: isSelected ? COLORS.primary : COLORS.border,
              }}
            >
              <Text style={{
                color: isSelected ? '#FFFFFF' : COLORS.textSecondary,
                fontSize: FONTS.sizes.sm,
                fontWeight: isSelected ? '600' : '400',
              }}>
                {interest}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedInterests.length > 0 && (
        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, marginTop: SPACING.md }}>
          {selectedInterests.length} interest{selectedInterests.length !== 1 ? 's' : ''} selected
        </Text>
      )}
    </Animated.View>
  );

  const styles = {
    stepTitle: {
      color: COLORS.textPrimary,
      fontSize: FONTS.sizes['2xl'],
      fontWeight: '800' as const,
      marginBottom: SPACING.sm,
    },
    stepSubtitle: {
      color: COLORS.textSecondary,
      fontSize: FONTS.sizes.base,
      lineHeight: 22,
      marginBottom: SPACING.xl,
    },
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <LoadingOverlay visible={updating || uploading} message="Setting up profile..." />

        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: SPACING.xl }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header with progress bar */}
          <Animated.View entering={FadeIn.duration(600)} style={{ marginBottom: SPACING.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl }}>
              <LinearGradient
                colors={COLORS.gradientPrimary}
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  alignItems: 'center', justifyContent: 'center', marginRight: 12,
                }}
              >
                <Ionicons name="person" size={22} color="#FFF" />
              </LinearGradient>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700' }}>
                  Profile Setup
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                  Step {step} of {totalSteps}
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={{ height: 4, backgroundColor: COLORS.border, borderRadius: 2 }}>
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
          </Animated.View>

          {/* Step content */}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}

          {/* Navigation buttons */}
          <View style={{ marginTop: SPACING.xl }}>
            <GradientButton
              title={step === totalSteps ? 'Complete Setup' : 'Continue'}
              onPress={() => {
                if (step === 1) {
                  if (validateStep1()) setStep(2);
                } else if (step === 2) {
                  setStep(3);
                } else {
                  handleComplete();
                }
              }}
              loading={updating || uploading}
            />

            {step > 1 && (
              <TouchableOpacity
                onPress={() => setStep(step - 1)}
                style={{ alignItems: 'center', marginTop: SPACING.md }}
              >
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base }}>
                  ← Back
                </Text>
              </TouchableOpacity>
            )}

            {step >= 2 && (
              <TouchableOpacity
                onPress={step === totalSteps ? handleComplete : () => setStep(step + 1)}
                style={{ alignItems: 'center', marginTop: SPACING.sm }}
              >
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                  Skip this step
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}