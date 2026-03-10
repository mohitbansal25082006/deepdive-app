// src/components/research/SourceImageGallery.tsx
// Horizontal scrolling gallery of images extracted from search sources.

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  Modal, Dimensions, ActivityIndicator, Linking,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SourceImage } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SW, height: SH } = Dimensions.get('window');
const THUMB_SIZE = 100;

interface Props {
  images: SourceImage[];
  title?: string;
}

export function SourceImageGallery({ images, title = 'Source Images' }: Props) {
  const [selected, setSelected] = useState<SourceImage | null>(null);
  const [loadErrors, setLoadErrors] = useState<Set<string>>(new Set());

  const validImages = images.filter(img => !loadErrors.has(img.url));

  if (validImages.length === 0) return null;

  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text style={{
        color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
        letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
      }}>
        {title} · {validImages.length}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
        {validImages.map((img, i) => (
          <Animated.View
            key={i}
            entering={FadeInDown.duration(400).delay(i * 60)}
          >
            <TouchableOpacity
              onPress={() => setSelected(img)}
              style={{
                width: THUMB_SIZE, height: THUMB_SIZE,
                borderRadius: RADIUS.md, overflow: 'hidden',
                borderWidth: 1, borderColor: COLORS.border,
              }}
            >
              <Image
                source={{ uri: img.thumbnailUrl ?? img.url }}
                style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                resizeMode="cover"
                onError={() => setLoadErrors(prev => new Set([...prev, img.url]))}
              />
              {/* Gradient overlay */}
              <LinearGradient
                colors={['transparent', 'rgba(10,10,26,0.6)']}
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 36,
                  justifyContent: 'flex-end', padding: 4,
                }}
              >
                {img.title && (
                  <Text style={{
                    color: '#FFF', fontSize: 8, lineHeight: 11,
                  }} numberOfLines={2}>
                    {img.title}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>

      {/* Full-screen image modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
          <SafeAreaView style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
            {/* Close button */}
            <TouchableOpacity
              onPress={() => setSelected(null)}
              style={{
                position: 'absolute', top: 16, right: 16, zIndex: 10,
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={22} color="#FFF" />
            </TouchableOpacity>

            {selected && (
              <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center', paddingHorizontal: SPACING.lg }}>
                <Image
                  source={{ uri: selected.url }}
                  style={{ width: SW - SPACING.lg * 2, height: SH * 0.55, borderRadius: RADIUS.xl }}
                  resizeMode="contain"
                />
                {selected.title && (
                  <Text style={{
                    color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600',
                    textAlign: 'center', marginTop: SPACING.md, lineHeight: 20,
                  }}>
                    {selected.title}
                  </Text>
                )}
                {selected.sourceUrl && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(selected.sourceUrl!)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      marginTop: SPACING.sm, backgroundColor: `${COLORS.primary}20`,
                      borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 8,
                      borderWidth: 1, borderColor: `${COLORS.primary}30`,
                    }}
                  >
                    <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                      View Source
                    </Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}