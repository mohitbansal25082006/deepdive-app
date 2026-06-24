// src/components/credits/InsufficientCreditsModal.tsx
// Part 24 — Bottom-sheet shown when a user tries to use a feature
// without enough credits. Offers "Buy Credits" CTA.
//
// Part 55.2 — FULL THEME-COMPATIBILITY PASS
//   Two hardcoded dark-only colors fixed on this component:
//
//   1. The BlurView / scrim backdrop was hardcoded to:
//      `backgroundColor: 'rgba(10,10,26,0.65)'`
//      This is a near-black indigo that works in dark themes but in light
//      themes it produces a very dark overlay on an already-light background,
//      making the interaction feel heavy and mismatched.
//      FIX: replaced with getModalBackdrop(0.65) which derives from the active
//      theme's COLORS.background, giving a naturally tinted translucent scrim
//      in every theme.
//
//   2. The BlurView `intensity` was set statically. In light themes, a fixed
//      blur intensity can look different from dark themes. We keep it at 20
//      but the correct background color now dominates the appearance anyway.
//
//   3. The sheet body background was COLORS.backgroundCard (already correct —
//      no change needed). All other colors already read from COLORS.*
//      and are fully theme-aware.
//
// NO FUNCTIONALITY CHANGED — only the scrim color is different.

import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView }       from 'expo-blur';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router }         from 'expo-router';
import {
  COLORS, FONTS, RADIUS, SPACING,
  getModalBackdrop,
}                         from '../../constants/theme';
import type { InsufficientCreditsInfo } from '../../types/credits';
import {
  CREDIT_PACKS, getTotalPackCredits,
  FEATURE_ICONS, formatCredits, formatINR,
}                         from '../../constants/credits';

interface Props {
  visible:  boolean;
  info:     InsufficientCreditsInfo | null;
  onClose:  () => void;
}

export function InsufficientCreditsModal({ visible, info, onClose }: Props) {
  if (!info) return null;

  // Find the smallest pack that covers the shortfall.
  const suggestedPack =
    CREDIT_PACKS.find(p => getTotalPackCredits(p) >= info.shortfall)
    ?? CREDIT_PACKS[CREDIT_PACKS.length - 1];

  const handleBuy = () => {
    onClose();
    router.push('/(app)/credits-store' as any);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {/*
        Part 55.2: the BlurView used to carry a hardcoded
        `backgroundColor: 'rgba(10,10,26,0.65)'` — a near-black indigo that
        only suited dark themes. In light themes it produced an unnecessarily
        heavy, mismatched scrim.

        Fix: getModalBackdrop(0.65) derives from COLORS.background, so:
          • Dark themes → deep, slightly tinted near-black scrim (same as before)
          • Light themes → soft, translucent pale scrim that matches the surface
        BlurView still adds the blur effect on top, unchanged.
      */}
      <BlurView
        intensity={20}
        style={{
          flex:            1,
          backgroundColor: getModalBackdrop(0.65),
          justifyContent:  'flex-end',
        }}
      >
        {/* Tapping outside the sheet closes it */}
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          entering={FadeInDown.duration(350).springify()}
          style={{
            backgroundColor:      COLORS.backgroundCard,
            borderTopLeftRadius:  28,
            borderTopRightRadius: 28,
            padding:              SPACING.xl,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
            paddingBottom:        SPACING.xl + 8,
          }}
        >
          {/* Drag handle */}
          <View style={{
            width:           40,
            height:          4,
            borderRadius:    2,
            backgroundColor: COLORS.border,
            alignSelf:       'center',
            marginBottom:    SPACING.lg,
          }} />

          {/* Icon + title */}
          <View style={{ alignItems: 'center', marginBottom: SPACING.lg }}>
            <LinearGradient
              colors={[`${COLORS.warning}25`, `${COLORS.error}15`]}
              style={{
                width:          72,
                height:         72,
                borderRadius:   22,
                alignItems:     'center',
                justifyContent: 'center',
                marginBottom:   SPACING.md,
                borderWidth:    1,
                borderColor:    `${COLORS.warning}30`,
              }}
            >
              <Ionicons name="flash" size={34} color={COLORS.warning} />
            </LinearGradient>

            <Text style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.xl,
              fontWeight: '800',
              textAlign:  'center',
            }}>
              Not Enough Credits
            </Text>
            <Text style={{
              color:      COLORS.textMuted,
              fontSize:   FONTS.sizes.sm,
              textAlign:  'center',
              marginTop:  6,
              lineHeight: 20,
            }}>
              You need{' '}
              <Text style={{ color: COLORS.warning, fontWeight: '700' }}>
                {formatCredits(info.required)}
              </Text>
              {' '}to run {info.featureLabel}.
            </Text>
          </View>

          {/* Balance info row */}
          <View style={{
            flexDirection:   'row',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius:    RADIUS.lg,
            padding:         SPACING.md,
            marginBottom:    SPACING.lg,
            borderWidth:     1,
            borderColor:     COLORS.border,
            gap:             SPACING.md,
          }}>
            {[
              { label: 'Your Balance', value: formatCredits(info.current),  color: COLORS.textMuted  },
              { label: 'Required',     value: formatCredits(info.required), color: COLORS.warning   },
              { label: 'Shortfall',    value: formatCredits(info.shortfall), color: COLORS.error    },
            ].map(item => (
              <View key={item.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{
                  color:      item.color,
                  fontSize:   FONTS.sizes.base,
                  fontWeight: '800',
                }}>
                  {item.value}
                </Text>
                <Text style={{
                  color:     COLORS.textMuted,
                  fontSize:  FONTS.sizes.xs,
                  marginTop: 2,
                  textAlign: 'center',
                }}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Suggested pack */}
          <View style={{
            backgroundColor: `${COLORS.primary}10`,
            borderRadius:    RADIUS.lg,
            padding:         SPACING.md,
            marginBottom:    SPACING.lg,
            borderWidth:     1,
            borderColor:     `${COLORS.primary}25`,
            flexDirection:   'row',
            alignItems:      'center',
            gap:             SPACING.md,
          }}>
            <LinearGradient
              colors={suggestedPack.gradientColors}
              style={{
                width:          44,
                height:         44,
                borderRadius:   13,
                alignItems:     'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={suggestedPack.iconName as any} size={20} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '700',
              }}>
                {suggestedPack.name} — {formatINR(suggestedPack.priceINR)}
              </Text>
              <Text style={{
                color:     COLORS.textMuted,
                fontSize:  FONTS.sizes.xs,
                marginTop: 2,
              }}>
                {getTotalPackCredits(suggestedPack)} credits — enough to run this feature
              </Text>
            </View>
          </View>

          {/* Buy Credits CTA */}
          <TouchableOpacity onPress={handleBuy} activeOpacity={0.85}>
            <LinearGradient
              colors={COLORS.gradientPrimary as [string, string]}
              style={{
                borderRadius:   RADIUS.lg,
                paddingVertical: 15,
                flexDirection:  'row',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            10,
              }}
            >
              <Ionicons name="flash" size={18} color="#FFF" />
              <Text style={{
                color:      '#FFF',
                fontSize:   FONTS.sizes.base,
                fontWeight: '800',
              }}>
                Buy Credits
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Dismiss link */}
          <TouchableOpacity
            onPress={onClose}
            style={{ alignItems: 'center', paddingTop: 14 }}
          >
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
              Maybe later
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </BlurView>
    </Modal>
  );
}