// app/(app)/onboarding-flow.tsx
// Part 27 (Final) — Single-screen onboarding: welcome bonus only.
//
// Steps 1-3 (interest picker, sample report, first query) have been removed.
// The screen mounts, shows the animated welcome bonus, and routes to home
// when the user taps "Start Researching".
//
// completeOnboarding([]) is called with an empty interest array — the home
// screen still shows trending topics from the global trending_topics table
// until the user's personal affinity data builds up naturally.

import React, { useState, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { router }           from 'expo-router';

import { useOnboarding } from '../../src/hooks/useOnboarding';
import { useCredits }    from '../../src/context/CreditsContext';
import { WelcomeBonusAnimation } from '../../src/components/onboarding/WelcomeBonusAnimation';
import { COLORS, SPACING } from '../../src/constants/theme';

export default function OnboardingFlowScreen() {
  const { completeOnboarding, skipOnboarding } = useOnboarding();
  const { refresh: refreshCredits }            = useCredits();
  const [completing, setCompleting]            = useState(false);

  const handleFinish = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    try {
      // Complete onboarding with no pre-selected interests.
      // Home screen personalization builds naturally from research activity.
      await completeOnboarding([], 10);
      await refreshCredits();
      router.replace('/(app)/(tabs)/home');
    } catch (err) {
      console.warn('[OnboardingFlow] finish error:', err);
      // Non-fatal: still navigate so user is never stuck
      router.replace('/(app)/(tabs)/home');
    } finally {
      setCompleting(false);
    }
  }, [completing, completeOnboarding, refreshCredits]);

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow:          1,
            paddingHorizontal: SPACING.xl,
            paddingTop:        SPACING.xl,
            paddingBottom:     SPACING['2xl'],
          }}
          showsVerticalScrollIndicator={false}
        >
          <WelcomeBonusAnimation
            onContinue={handleFinish}
            isLoading={completing}
          />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}