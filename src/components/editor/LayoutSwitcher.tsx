// src/components/editor/LayoutSwitcher.tsx
// Part 28 — Slide Canvas Editor: Layout switcher bottom sheet
// ─────────────────────────────────────────────────────────────────────────────
//
// Shows all 11 layout types as miniature SlideCard previews.
// Tapping one calls onSelectLayout with the new layout.
// The current layout is highlighted.
// Includes a brief description of each layout.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  Dimensions,
} from 'react-native';
import { LinearGradient }     from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import { useSafeAreaInsets }  from 'react-native-safe-area-context';

import { SlideCard }               from '../research/SlideCard';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { PresentationSlide, PresentationThemeTokens, SlideLayout } from '../../types';

// ─── Layout metadata ──────────────────────────────────────────────────────────

interface LayoutMeta {
  id:          SlideLayout;
  label:       string;
  description: string;
  icon:        string;
  previewSlide: Partial<PresentationSlide>;
}

const LAYOUT_META: LayoutMeta[] = [
  {
    id:          'title',
    label:       'Title Slide',
    description: 'Cover page with big title, subtitle and badge',
    icon:        'telescope-outline',
    previewSlide: {
      layout:    'title',
      title:     'Presentation Title',
      subtitle:  'DeepDive AI · Research Report',
      badgeText: 'Deep Dive',
    },
  },
  {
    id:          'agenda',
    label:       'Agenda',
    description: 'Numbered list of section names in two columns',
    icon:        'list-outline',
    previewSlide: {
      layout:  'agenda',
      title:   'Today\'s Agenda',
      bullets: ['Overview', 'Key Findings', 'Market Data', 'Predictions', 'Conclusion'],
    },
  },
  {
    id:          'section',
    label:       'Section Break',
    description: 'Full-color divider with big section title',
    icon:        'bookmark-outline',
    previewSlide: {
      layout:     'section',
      sectionTag: 'Part 1',
      title:      'Section Title',
    },
  },
  {
    id:          'content',
    label:       'Content',
    description: 'Title + body paragraph with left accent bar',
    icon:        'document-text-outline',
    previewSlide: {
      layout: 'content',
      title:  'Key Insights',
      body:   'This slide presents the main body paragraph content in a clean, readable layout with a colored left accent bar and clear typographic hierarchy.',
    },
  },
  {
    id:          'bullets',
    label:       'Key Points',
    description: 'Title + up to 6 bullet points with dot markers',
    icon:        'checkmark-circle-outline',
    previewSlide: {
      layout:  'bullets',
      title:   'Key Takeaways',
      bullets: ['First important point to remember', 'Second critical insight for the audience', 'Third finding from the research'],
    },
  },
  {
    id:          'stats',
    label:       'Statistics',
    description: 'Up to 4 stat cards with big numbers',
    icon:        'stats-chart-outline',
    previewSlide: {
      layout: 'stats',
      title:  'By the Numbers',
      stats:  [
        { value: '87%', label: 'Adoption Rate',   color: '#6C63FF' },
        { value: '$4B', label: 'Market Size',     color: '#43E97B' },
        { value: '3.2×', label: 'Growth Factor',  color: '#FFA726' },
      ],
    },
  },
  {
    id:          'quote',
    label:       'Pull Quote',
    description: 'Full-color slide with a single impactful quote',
    icon:        'chatbubble-ellipses-outline',
    previewSlide: {
      layout:           'quote',
      quote:            'The best way to predict the future is to create it.',
      quoteAttribution: 'Abraham Lincoln',
      title:            'Pull Quote',
    },
  },
  {
    id:          'chart_ref',
    label:       'Chart & Analysis',
    description: 'Chart placeholder on left, analysis text on right',
    icon:        'bar-chart-outline',
    previewSlide: {
      layout: 'chart_ref',
      title:  'Market Trend Analysis',
      body:   'The data shows a consistent upward trajectory across all measured segments, with particularly strong growth in the enterprise sector over the past 18 months.',
    },
  },
  {
    id:          'predictions',
    label:       'Future Outlook',
    description: 'Timeline-style numbered prediction list',
    icon:        'telescope-outline',
    previewSlide: {
      layout:  'predictions',
      title:   'What\'s Next',
      bullets: ['AI adoption will double by 2026', 'Market consolidation in key segments', 'Regulatory frameworks will emerge'],
    },
  },
  {
    id:          'references',
    label:       'References',
    description: 'Numbered citation list with source details',
    icon:        'link-outline',
    previewSlide: {
      layout:  'references',
      title:   'Sources & References',
      bullets: ['Reuters — Global AI Market Report 2024', 'Nature — Machine Learning Survey Q3 2024', 'Gartner — Hype Cycle for AI 2024'],
    },
  },
  {
    id:          'closing',
    label:       'Closing',
    description: 'Thank-you slide with centered title and brand mark',
    icon:        'sparkles-outline',
    previewSlide: {
      layout:   'closing',
      title:    'Thank You',
      subtitle: 'Questions & Discussion',
    },
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface LayoutSwitcherProps {
  visible:         boolean;
  currentLayout:   SlideLayout;
  tokens:          PresentationThemeTokens;
  onSelectLayout:  (layout: SlideLayout) => void;
  onClose:         () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W   = Dimensions.get('window').width;
const SCREEN_H   = Dimensions.get('window').height;
const CARD_W     = (SCREEN_W - SPACING.lg * 2 - SPACING.sm) / 2;
const CARD_H     = Math.round(CARD_W * (9 / 16));
const CARD_SCALE = CARD_W / 320;

// ─── Item ─────────────────────────────────────────────────────────────────────

const LayoutItem = React.memo(function LayoutItem({
  meta,
  tokens,
  isActive,
  onSelect,
}: {
  meta:     LayoutMeta;
  tokens:   PresentationThemeTokens;
  isActive: boolean;
  onSelect: (id: SlideLayout) => void;
}) {
  const slide: PresentationSlide = {
    ...meta.previewSlide,
    id:          `preview_${meta.id}`,
    slideNumber: 1,
    layout:      meta.id,
    title:       meta.previewSlide.title ?? 'Preview',
    accentColor: tokens.primary,
    icon:        meta.icon,
  } as PresentationSlide;

  return (
    <Pressable
      onPress={() => onSelect(meta.id)}
      style={{
        width:           CARD_W,
        marginBottom:    SPACING.md,
        borderRadius:    RADIUS.lg,
        overflow:        'hidden',
        borderWidth:     isActive ? 2.5 : 1.5,
        borderColor:     isActive ? COLORS.primary : COLORS.border,
        ...(isActive && {
          shadowColor:   COLORS.primary,
          shadowOffset:  { width: 0, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius:  8,
          elevation:     6,
        }),
      }}
    >
      {/* Slide preview */}
      <SlideCard slide={slide} tokens={tokens} scale={CARD_SCALE} />

      {/* Label row */}
      <View style={{
        backgroundColor: isActive ? `${COLORS.primary}18` : COLORS.backgroundElevated,
        paddingHorizontal: SPACING.sm,
        paddingVertical:   7,
        flexDirection:     'row',
        alignItems:        'center',
        gap:               6,
      }}>
        <Ionicons
          name={meta.icon as any}
          size={13}
          color={isActive ? COLORS.primary : COLORS.textMuted}
        />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: isActive ? COLORS.primary : COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
            {meta.label}
          </Text>
          <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 1 }}>
            {meta.description}
          </Text>
        </View>
        {isActive && (
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ionicons name="checkmark" size={11} color="#FFF" />
          </View>
        )}
      </View>
    </Pressable>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function LayoutSwitcher({
  visible,
  currentLayout,
  tokens,
  onSelectLayout,
  onClose,
}: LayoutSwitcherProps) {
  const insets = useSafeAreaInsets();

  const handleSelect = useCallback((layout: SlideLayout) => {
    onSelectLayout(layout);
    onClose();
  }, [onSelectLayout, onClose]);

  const renderItem = useCallback(({ item }: { item: LayoutMeta }) => (
    <LayoutItem
      meta={item}
      tokens={tokens}
      isActive={item.id === currentLayout}
      onSelect={handleSelect}
    />
  ), [tokens, currentLayout, handleSelect]);

  const renderHeader = useCallback(() => (
    <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
      {/* Handle */}
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md }} />
      {/* Title row */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <LinearGradient
          colors={['#6C63FF', '#8B5CF6']}
          style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
        >
          <Ionicons name="grid" size={17} color="#FFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Choose Layout</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Content remapped automatically</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={22} color={COLORS.textMuted} />
        </Pressable>
      </View>

      {/* Current layout badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.md, backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
        <Ionicons name="layers-outline" size={14} color={COLORS.primary} />
        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>
          Current: <Text style={{ color: COLORS.primary, fontWeight: '700' }}>
            {LAYOUT_META.find(m => m.id === currentLayout)?.label ?? currentLayout}
          </Text>
        </Text>
      </View>
    </View>
  ), [currentLayout, onClose]);

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
            paddingTop:           SPACING.md,
            paddingBottom:        insets.bottom + SPACING.sm,
            maxHeight:            SCREEN_H * 0.88,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
          }}
        >
          <FlatList
            data={LAYOUT_META}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            numColumns={2}
            ListHeaderComponent={renderHeader}
            columnWrapperStyle={{ gap: SPACING.sm, paddingHorizontal: SPACING.lg }}
            showsVerticalScrollIndicator={false}
            initialNumToRender={6}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}