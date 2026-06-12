// src/components/research/SourceImageGallery.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Source image gallery  (REDESIGN)
// Rounded thumbnails with gradient captions + immersive full-screen lightbox.
// Drop-in compatible: export `SourceImageGallery`, props { images, title? }.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Image,
  Modal, Dimensions, Linking,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SourceImage } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SW, height: SH } = Dimensions.get('window');
const THUMB = 116;

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: SPACING.sm }}>
        <View style={{
          width: 22, height: 22, borderRadius: 7,
          backgroundColor: `${COLORS.primary}1A`, alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="images-outline" size={12} color={COLORS.primary} />
        </View>
        <Text style={{
          color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700',
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          {title}
        </Text>
        <View style={{ backgroundColor: `${COLORS.primary}1A`, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 1 }}>
          <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '800' }}>{validImages.length}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingRight: SPACING.sm }}>
        {validImages.map((img, i) => (
          <Animated.View key={i} entering={FadeInDown.duration(420).delay(i * 55)}>
            <Pressable
              onPress={() => setSelected(img)}
              style={({ pressed }) => [{
                width: THUMB, height: THUMB,
                borderRadius: RADIUS.lg, overflow: 'hidden',
                borderWidth: 1, borderColor: COLORS.border,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              }]}
            >
              <Image
                source={{ uri: img.thumbnailUrl ?? img.url }}
                style={{ width: THUMB, height: THUMB }}
                resizeMode="cover"
                onError={() => setLoadErrors(prev => new Set([...prev, img.url]))}
              />
              <LinearGradient
                colors={['transparent', 'rgba(8,8,20,0.85)']}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, justifyContent: 'flex-end', padding: 6 }}
              >
                {img.title ? (
                  <Text style={{ color: '#FFF', fontSize: 8.5, lineHeight: 11, fontWeight: '600' }} numberOfLines={2}>
                    {img.title}
                  </Text>
                ) : null}
              </LinearGradient>
              <View style={{
                position: 'absolute', top: 6, right: 6,
                width: 22, height: 22, borderRadius: 11,
                backgroundColor: 'rgba(8,8,20,0.6)', alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="expand" size={11} color="#FFF" />
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>

      {/* Lightbox */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(4,4,12,0.96)' }}>
          <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Pressable
              onPress={() => setSelected(null)}
              style={{
                position: 'absolute', top: 14, right: 14, zIndex: 10,
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
              }}
            >
              <Ionicons name="close" size={22} color="#FFF" />
            </Pressable>

            {selected && (
              <Animated.View entering={FadeIn.duration(280)} style={{ alignItems: 'center', paddingHorizontal: SPACING.lg }}>
                <Image
                  source={{ uri: selected.url }}
                  style={{ width: SW - SPACING.lg * 2, height: SH * 0.56, borderRadius: RADIUS.xl }}
                  resizeMode="contain"
                />
                {selected.title ? (
                  <Text style={{
                    color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700',
                    textAlign: 'center', marginTop: SPACING.md, lineHeight: 21,
                  }}>
                    {selected.title}
                  </Text>
                ) : null}
                {selected.sourceUrl ? (
                  <Pressable
                    onPress={() => Linking.openURL(selected.sourceUrl!)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: SPACING.md,
                      backgroundColor: `${COLORS.primary}22`,
                      borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 10,
                      borderWidth: 1, borderColor: `${COLORS.primary}44`,
                    }}
                  >
                    <Ionicons name="open-outline" size={15} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>View Source</Text>
                  </Pressable>
                ) : null}
              </Animated.View>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}