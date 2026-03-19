// src/components/credits/InsufficientCreditsModal.tsx
// Part 24 — Bottom-sheet shown when a user tries to use a feature
// without enough credits. Offers "Buy Credits" CTA.

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
import { COLORS, FONTS, RADIUS, SPACING } from '../../constants/theme';
import type { InsufficientCreditsInfo } from '../../types/credits';
import { FEATURE_ICONS, formatCredits, formatINR } from '../../constants/credits';
import { CREDIT_PACKS, getTotalPackCredits } from '../../constants/credits';

interface Props {
  visible:  boolean;
  info:     InsufficientCreditsInfo | null;
  onClose:  () => void;
}

export function InsufficientCreditsModal({ visible, info, onClose }: Props) {
  if (!info) return null;

  // Find the smallest pack that covers the shortfall
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
      <BlurView
        intensity={20}
        style={{
          flex:            1,
          backgroundColor: 'rgba(10,10,26,0.65)',
          justifyContent:  'flex-end',
        }}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

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
            width:           40, height: 4, borderRadius: 2,
            backgroundColor: COLORS.border,
            alignSelf:       'center',
            marginBottom:    SPACING.lg,
          }} />

          {/* Icon + title */}
          <View style={{ alignItems: 'center', marginBottom: SPACING.lg }}>
            <LinearGradient
              colors={[`${COLORS.warning}25`, `${COLORS.error}15`]}
              style={{
                width:          72, height: 72, borderRadius: 22,
                alignItems:     'center', justifyContent: 'center',
                marginBottom:   SPACING.md,
                borderWidth:    1, borderColor: `${COLORS.warning}30`,
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
              color:     COLORS.textMuted,
              fontSize:  FONTS.sizes.sm,
              textAlign: 'center',
              marginTop: 6,
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
            gap:              SPACING.md,
          }}>
            {[
              { label: 'Your Balance', value: formatCredits(info.current), color: COLORS.textMuted  },
              { label: 'Required',     value: formatCredits(info.required), color: COLORS.warning   },
              { label: 'Shortfall',    value: formatCredits(info.shortfall), color: COLORS.error    },
            ].map(item => (
              <View key={item.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: item.color, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                  {item.value}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
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
            gap:              SPACING.md,
          }}>
            <LinearGradient
              colors={suggestedPack.gradientColors}
              style={{
                width:          44, height: 44, borderRadius: 13,
                alignItems:     'center', justifyContent: 'center',
              }}
            >
              <Ionicons name={suggestedPack.iconName as any} size={20} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                {suggestedPack.name} — {formatINR(suggestedPack.priceINR)}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                {getTotalPackCredits(suggestedPack)} credits — enough to run this feature
              </Text>
            </View>
          </View>

          {/* CTAs */}
          <TouchableOpacity onPress={handleBuy} activeOpacity={0.85}>
            <LinearGradient
              colors={COLORS.gradientPrimary}
              style={{
                borderRadius:    RADIUS.lg,
                paddingVertical: 15,
                flexDirection:   'row',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             10,
              }}
            >
              <Ionicons name="flash" size={18} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                Buy Credits
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingTop: 14 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
              Maybe later
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </BlurView>
    </Modal>
  );
}