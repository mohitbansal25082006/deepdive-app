// src/components/workspace/AvatarPickerModal.tsx
// Part 11 — Full-screen avatar picker using DiceBear free API.
//           PNG output; no external SVG library needed.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInDown,
  ZoomIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AVATAR_STYLES,
  generateAvatarOptions,
  randomAvatarOption,
  saveAvatarToProfile,
} from '../../services/avatarService';
import { AvatarStyle, AvatarStyleOption, AvatarOption } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SW } = Dimensions.get('window');
const AVATAR_SIZE   = (SW - SPACING.xl * 2 - SPACING.sm * 3) / 4; // 4-column grid

interface Props {
  visible:          boolean;
  currentAvatarUrl: string | null | undefined;
  username:         string | null | undefined;
  onClose:          () => void;
  onSaved:          (newUrl: string) => void;
}

export function AvatarPickerModal({
  visible, currentAvatarUrl, username, onClose, onSaved,
}: Props) {
  const [activeStyle,   setActiveStyle]   = useState<AvatarStyle>('avataaars');
  const [options,       setOptions]       = useState<AvatarOption[]>([]);
  const [selected,      setSelected]      = useState<AvatarOption | null>(null);
  const [isSaving,      setIsSaving]      = useState(false);

  // ── Build avatar grid whenever style or username changes ──────────────────
  const buildOptions = useCallback((style: AvatarStyle) => {
    const seed = username ?? 'user';
    setOptions(generateAvatarOptions(style, seed, 12));
    setSelected(null);
  }, [username]);

  useEffect(() => {
    if (visible) buildOptions(activeStyle);
  }, [visible, activeStyle, buildOptions]);

  const handleStyleSelect = (style: AvatarStyle) => {
    setActiveStyle(style);
  };

  const handleShuffle = () => {
    const extra = Array.from({ length: 12 }, () => randomAvatarOption(activeStyle));
    setOptions(extra);
    setSelected(null);
  };

  const handleSave = async () => {
    const target = selected;
    if (!target) return;
    setIsSaving(true);
    const { success, error } = await saveAvatarToProfile(target.url);
    setIsSaving(false);
    if (!success) {
      Alert.alert('Error', error ?? 'Could not save avatar');
      return;
    }
    onSaved(target.url);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>

          {/* ── Header ── */}
          <Animated.View entering={FadeIn.duration(350)} style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Choose Avatar</Text>
            {/* Shuffle */}
            <TouchableOpacity onPress={handleShuffle} style={styles.shuffleBtn}>
              <Ionicons name="shuffle-outline" size={18} color={COLORS.primary} />
              <Text style={styles.shuffleBtnText}>Shuffle</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Current / selected preview ── */}
          <Animated.View entering={FadeIn.duration(400).delay(80)} style={styles.previewRow}>
            <View style={styles.previewWrap}>
              {(selected?.url ?? currentAvatarUrl) ? (
                <Image
                  source={{ uri: selected?.url ?? currentAvatarUrl! }}
                  style={styles.previewImage}
                />
              ) : (
                <View style={styles.previewPlaceholder}>
                  <Ionicons name="person" size={36} color={COLORS.textMuted} />
                </View>
              )}
              {selected && (
                <Animated.View entering={ZoomIn.duration(200)} style={styles.previewCheck}>
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                </Animated.View>
              )}
            </View>
            <View style={styles.previewInfo}>
              <Text style={styles.previewLabel}>
                {selected ? 'Selected — tap Save to apply' : 'Tap an avatar to preview'}
              </Text>
              <Text style={styles.previewSub}>
                Powered by{' '}
                <Text style={{ color: COLORS.primary }}>DiceBear</Text>
                {' '}— always free
              </Text>
            </View>
          </Animated.View>

          {/* ── Style selector ── */}
          <Animated.View entering={FadeInDown.duration(350).delay(100)}>
            <Text style={styles.sectionLabel}>Style</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.styleScroll}
            >
              {AVATAR_STYLES.map((opt: AvatarStyleOption) => (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => handleStyleSelect(opt.id)}
                  style={[
                    styles.styleChip,
                    activeStyle === opt.id && styles.styleChipActive,
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={styles.styleChipEmoji}>{opt.emoji}</Text>
                  <Text style={[
                    styles.styleChipLabel,
                    activeStyle === opt.id && styles.styleChipLabelActive,
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>

          {/* ── Avatar grid ── */}
          <Animated.View entering={FadeInDown.duration(350).delay(150)} style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Pick one</Text>
            <FlatList
              data={options}
              numColumns={4}
              keyExtractor={(item) => `${item.style}-${item.seed}`}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={styles.gridRow}
              renderItem={({ item, index }) => (
                <AvatarCell
                  item={item}
                  index={index}
                  isSelected={selected?.seed === item.seed && selected?.style === item.style}
                  onPress={() => setSelected(item)}
                  size={AVATAR_SIZE}
                />
              )}
            />
          </Animated.View>

          {/* ── Save bar ── */}
          <Animated.View entering={FadeIn.duration(300).delay(200)} style={styles.saveBar}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!selected || isSaving}
              activeOpacity={0.85}
              style={[
                styles.saveBtn,
                { opacity: selected && !isSaving ? 1 : 0.4 },
              ]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                  <Text style={styles.saveBtnText}>Save Avatar</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

// ─── Avatar Cell ──────────────────────────────────────────────────────────────

function AvatarCell({
  item, index, isSelected, onPress, size,
}: {
  item: AvatarOption;
  index: number;
  isSelected: boolean;
  onPress: () => void;
  size: number;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Animated.View entering={ZoomIn.duration(250).delay(index * 25)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={[
          cellStyles.wrap,
          { width: size, height: size },
          isSelected && cellStyles.wrapSelected,
        ]}
      >
        {!loaded && (
          <View style={[cellStyles.shimmer, { width: size, height: size }]}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        )}
        <Image
          source={{ uri: item.url }}
          style={[
            cellStyles.img,
            { width: size, height: size, opacity: loaded ? 1 : 0 },
          ]}
          onLoad={() => setLoaded(true)}
        />
        {isSelected && (
          <Animated.View entering={ZoomIn.duration(180)} style={cellStyles.checkOverlay}>
            <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
          </Animated.View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical:   SPACING.md,
    gap:            SPACING.sm,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  headerTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.xl,
    fontWeight: '800',
    textAlign: 'center',
  },
  shuffleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: `${COLORS.primary}15`,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: `${COLORS.primary}30`,
  },
  shuffleBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' },

  // Preview
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  previewWrap:    { position: 'relative' },
  previewImage:   { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.backgroundElevated },
  previewPlaceholder: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  previewCheck:   { position: 'absolute', bottom: -4, right: -4, backgroundColor: COLORS.backgroundCard, borderRadius: 11 },
  previewInfo:    { flex: 1 },
  previewLabel:   { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  previewSub:     { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4 },

  // Section label
  sectionLabel: {
    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm, marginTop: SPACING.sm,
  },

  // Style chips
  styleScroll: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  styleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: COLORS.border,
  },
  styleChipActive: {
    backgroundColor: `${COLORS.primary}20`,
    borderColor: `${COLORS.primary}60`,
  },
  styleChipEmoji: { fontSize: 14 },
  styleChipLabel: {
    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
  },
  styleChipLabelActive: { color: COLORS.primary },

  // Grid
  grid:    { paddingHorizontal: SPACING.xl, paddingBottom: 20 },
  gridRow: { gap: SPACING.sm, marginBottom: SPACING.sm },

  // Save bar
  saveBar: {
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  saveBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' },
});

const cellStyles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  wrapSelected: {
    borderColor: COLORS.success,
    backgroundColor: `${COLORS.success}15`,
  },
  shimmer: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
  },
  img:          { borderRadius: RADIUS.md },
  checkOverlay: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: COLORS.backgroundCard, borderRadius: 11,
  },
});