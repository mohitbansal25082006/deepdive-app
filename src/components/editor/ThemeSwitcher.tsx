// src/components/editor/ThemeSwitcher.tsx
// Part 28 — Slide Canvas Editor: Theme switcher bottom sheet
// ─────────────────────────────────────────────────────────────────────────────
//
// Shows all 4 themes as full-card previews including a mini 3-slide deck.
// Switching a theme calls onSelectTheme; the parent applies it deck-wide.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient }     from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import { useSafeAreaInsets }  from 'react-native-safe-area-context';

import { SlideCard }                       from '../research/SlideCard';
import { getThemeTokens }                  from '../../services/pptxExport';
import { COLORS, FONTS, SPACING, RADIUS }  from '../../constants/theme';
import type { PresentationTheme, PresentationSlide } from '../../types';

// ─── Theme metadata ───────────────────────────────────────────────────────────

interface ThemeMeta {
  id:          PresentationTheme;
  label:       string;
  description: string;
  icon:        string;
  gradient:    readonly [string, string];
  tag?:        string;
}

const THEME_META: ThemeMeta[] = [
  {
    id:          'dark',
    label:       'Dark Pro',
    description: 'Deep space aesthetic — our signature look',
    icon:        'moon',
    gradient:    ['#6C63FF', '#8B5CF6'],
    tag:         'Popular',
  },
  {
    id:          'light',
    label:       'Clean Light',
    description: 'Minimal white — great for printing & sharing',
    icon:        'sunny',
    gradient:    ['#6C63FF', '#4FACFE'],
  },
  {
    id:          'corporate',
    label:       'Corporate Blue',
    description: 'Classic professional — boardroom ready',
    icon:        'briefcase',
    gradient:    ['#0052CC', '#4FACFE'],
  },
  {
    id:          'vibrant',
    label:       'Vibrant',
    description: 'Bold & energetic — designed to stand out',
    icon:        'sparkles',
    gradient:    ['#FF6584', '#F093FB'],
  },
];

// ─── Preview slides for each theme ───────────────────────────────────────────

function makePreviewSlides(): Omit<PresentationSlide, 'slideNumber'>[] {
  return [
    {
      id: 'prev_title',
      layout: 'title',
      title: 'Sample Title',
      subtitle: 'Research Report · 2024',
      badgeText: 'Deep Dive',
      icon: 'telescope-outline',
    },
    {
      id: 'prev_bullets',
      layout: 'bullets',
      title: 'Key Points',
      bullets: ['First important insight', 'Second critical finding', 'Third trend observed'],
      icon: 'checkmark-circle-outline',
    },
    {
      id: 'prev_stats',
      layout: 'stats',
      title: 'By the Numbers',
      stats: [
        { value: '87%', label: 'Growth', color: '#43E97B' },
        { value: '$4B', label: 'Market', color: '#6C63FF' },
      ],
      icon: 'stats-chart-outline',
    },
  ];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W      = Dimensions.get('window').width;
const SCREEN_H      = Dimensions.get('window').height;
const MINI_SCALE    = 0.22;
const MINI_W        = Math.round(320 * MINI_SCALE);
const MINI_H        = Math.round(180 * MINI_SCALE);

// ─── Props ────────────────────────────────────────────────────────────────────

interface ThemeSwitcherProps {
  visible:        boolean;
  currentTheme:   PresentationTheme;
  onSelectTheme:  (theme: PresentationTheme) => void;
  onClose:        () => void;
}

// ─── Theme Card ───────────────────────────────────────────────────────────────

const ThemeCard = React.memo(function ThemeCard({
  meta,
  isActive,
  onSelect,
}: {
  meta:     ThemeMeta;
  isActive: boolean;
  onSelect: (id: PresentationTheme) => void;
}) {
  const tokens       = useMemo(() => getThemeTokens(meta.id), [meta.id]);
  const previewSlides = useMemo(() => makePreviewSlides().map((s, i) => ({
    ...s,
    slideNumber:  i + 1,
    accentColor:  tokens.primary,
  }) as PresentationSlide), [tokens.primary]);

  return (
    <Pressable
      onPress={() => onSelect(meta.id)}
      style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        marginBottom:    SPACING.md,
        borderWidth:     isActive ? 2 : 1,
        borderColor:     isActive ? COLORS.primary : COLORS.border,
        overflow:        'hidden',
        ...(isActive && {
          shadowColor:   COLORS.primary,
          shadowOffset:  { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius:  12,
          elevation:     8,
        }),
      }}
    >
      {/* Theme preview header */}
      <LinearGradient
        colors={[meta.gradient[0] + '22', meta.gradient[1] + '11']}
        style={{
          padding:        SPACING.md,
          flexDirection:  'row',
          alignItems:     'center',
          gap:            SPACING.md,
        }}
      >
        {/* Icon bubble */}
        <LinearGradient
          colors={meta.gradient}
          style={{
            width:           44,
            height:          44,
            borderRadius:    14,
            alignItems:      'center',
            justifyContent:  'center',
            flexShrink:      0,
          }}
        >
          <Ionicons name={meta.icon as any} size={22} color="#FFF" />
        </LinearGradient>

        {/* Labels */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
              {meta.label}
            </Text>
            {meta.tag && (
              <View style={{ backgroundColor: meta.gradient[0] + '28', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: meta.gradient[0] + '55' }}>
                <Text style={{ color: meta.gradient[0], fontSize: 9, fontWeight: '700' }}>{meta.tag}</Text>
              </View>
            )}
          </View>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
            {meta.description}
          </Text>
        </View>

        {/* Selected badge */}
        {isActive ? (
          <LinearGradient
            colors={meta.gradient}
            style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Ionicons name="checkmark" size={15} color="#FFF" />
          </LinearGradient>
        ) : (
          <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: COLORS.border, flexShrink: 0 }} />
        )}
      </LinearGradient>

      {/* Mini slide previews strip */}
      <View style={{
        flexDirection:    'row',
        gap:              SPACING.sm,
        paddingHorizontal: SPACING.md,
        paddingBottom:    SPACING.md,
        backgroundColor:  tokens.background + 'AA',
        paddingTop:       SPACING.sm,
        borderTopWidth:   1,
        borderTopColor:   COLORS.border,
      }}>
        {previewSlides.slice(0, 3).map((slide) => (
          <View
            key={slide.id}
            style={{
              borderRadius:  6,
              overflow:      'hidden',
              borderWidth:   1,
              borderColor:   COLORS.border,
              shadowColor:   '#000',
              shadowOffset:  { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius:  4,
              elevation:     3,
            }}
          >
            <SlideCard slide={slide} tokens={tokens} scale={MINI_SCALE} />
          </View>
        ))}

        {/* Color chips showing the theme palette */}
        <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
          {[tokens.primary, tokens.textPrimary, tokens.surface].map((c, i) => (
            <View key={i} style={{ width: 24, height: 8, borderRadius: 4, backgroundColor: c, borderWidth: 1, borderColor: COLORS.border }} />
          ))}
        </View>
      </View>
    </Pressable>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function ThemeSwitcher({
  visible,
  currentTheme,
  onSelectTheme,
  onClose,
}: ThemeSwitcherProps) {
  const insets = useSafeAreaInsets();

  const handleSelect = useCallback((theme: PresentationTheme) => {
    onSelectTheme(theme);
    onClose();
  }, [onSelectTheme, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor:      COLORS.backgroundCard,
            borderTopLeftRadius:  24,
            borderTopRightRadius: 24,
            paddingTop:           SPACING.sm,
            paddingBottom:        insets.bottom + SPACING.sm,
            maxHeight:            SCREEN_H * 0.92,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
          }}
        >
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <LinearGradient
              colors={['#6C63FF', '#8B5CF6']}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
            >
              <Ionicons name="color-palette" size={17} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Presentation Theme</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Applied to all slides instantly</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* Warning banner — theme change cannot be undone individually */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: `${COLORS.warning}12`, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.warning}25` }}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.warning} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, flex: 1 }}>
              Theme applies to <Text style={{ fontWeight: '700' }}>all slides</Text>. This can be undone with the undo button.
            </Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg }}
          >
            {THEME_META.map(meta => (
              <ThemeCard
                key={meta.id}
                meta={meta}
                isActive={meta.id === currentTheme}
                onSelect={handleSelect}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}