// src/components/editor/TemplateLibrary.tsx
// Part 29 — NEW FILE
// Full-featured template library bottom sheet with:
//   • Category filter tabs (All + 8 categories)
//   • 3-column grid of template cards with live mini slide previews
//   • Template detail sheet: full slide deck preview + Apply/Insert actions
//   • "Apply" = replaces all slides (destructive, confirmation in hook)
//   • "Insert" = inserts after active slide (non-destructive)
//   • Suggested theme badge per template
//   • Usage tracking (fire-and-forget)
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState, useCallback, useMemo,
} from 'react';
import {
  View, Text, Modal, Pressable, ScrollView,
  FlatList, Dimensions, TouchableOpacity,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';

import { SlideCard }     from '../research/SlideCard';
import { getThemeTokens } from '../../services/pptxExport';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import {
  SLIDE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplatesByCategory,
  TEMPLATE_COUNT,
} from '../../constants/slideTemplates';
import type { SlideTemplate, TemplateCategoryMeta, TemplateCategory } from '../../types/editor';
import type { PresentationTheme, PresentationSlide } from '../../types';

// ─── Local type: allows 'all' as a valid id alongside TemplateCategory ────────
// TemplateCategoryMeta.id is typed as TemplateCategory (the union of real
// categories). We extend it with a string-widened version so the synthetic
// "All" tab entry with id='all' compiles without errors.
type LibraryCategoryMeta = Omit<TemplateCategoryMeta, 'id'> & { id: TemplateCategory | 'all' };

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Grid card
const GRID_COLS  = 2;
const CARD_GAP   = SPACING.sm;
const CARD_W     = (SCREEN_W - SPACING.lg * 2 - CARD_GAP) / GRID_COLS;
const CARD_H     = Math.round(CARD_W * (9 / 16));
const CARD_SCALE = CARD_W / 320;

// Detail slide preview
const DETAIL_SLIDE_W = SCREEN_W - SPACING.lg * 2;
const DETAIL_SLIDE_H = Math.round(DETAIL_SLIDE_W * (9 / 16));
const DETAIL_SCALE   = DETAIL_SLIDE_W / 320;

// Thumb in detail
const THUMB_W     = 72;
const THUMB_H     = Math.round(THUMB_W * (9 / 16));
const THUMB_SCALE = THUMB_W / 320;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THEME_LABELS: Record<PresentationTheme, string> = {
  dark:      'Dark Pro',
  light:     'Clean Light',
  corporate: 'Corporate',
  vibrant:   'Vibrant',
};

/** Convert a SlideTemplateSlide to a PresentationSlide for preview rendering */
function templateSlideToPresSlide(
  ts: SlideTemplate['slides'][number],
  index: number,
  accentColor: string,
): PresentationSlide {
  return {
    id:               `prev_${index}`,
    slideNumber:      index + 1,
    layout:           ts.layout,
    title:            ts.title,
    subtitle:         ts.subtitle,
    body:             ts.body,
    bullets:          ts.bullets,
    stats:            ts.stats,
    quote:            ts.quote,
    quoteAttribution: ts.quoteAttribution,
    sectionTag:       ts.sectionTag,
    badgeText:        ts.badgeText,
    speakerNotes:     ts.speakerNotes,
    accentColor:      accentColor,
    icon:             ts.icon ?? 'document-text-outline',
  } as PresentationSlide;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TemplateLibraryProps {
  visible:           boolean;
  currentTheme:      PresentationTheme;
  activeSlideIndex:  number;
  presentationId:    string;
  onApplyTemplate:   (template: SlideTemplate) => void;
  onInsertTemplate:  (template: SlideTemplate) => void;
  onClose:           () => void;
}

// ─── Category "All" meta ──────────────────────────────────────────────────────

const ALL_CATEGORY: TemplateCategoryMeta = {
  id:          'business' as any, // reused as 'all' guard
  label:       'All',
  emoji:       '✨',
  description: 'All templates',
};

// ─── Template Grid Card ───────────────────────────────────────────────────────

const TemplateGridCard = React.memo(function TemplateGridCard({
  template,
  theme,
  onPress,
}: {
  template: SlideTemplate;
  theme:    PresentationTheme;
  onPress:  (t: SlideTemplate) => void;
}) {
  const tokens      = useMemo(() => getThemeTokens(template.suggestedTheme ?? theme), [template.suggestedTheme, theme]);
  const accentColor = tokens.primary;

  // Use the first slide as the card preview
  const previewSlide: PresentationSlide = useMemo(
    () => templateSlideToPresSlide(template.slides[0], 0, accentColor),
    [template.slides, accentColor],
  );

  return (
    <Pressable
      onPress={() => onPress(template)}
      style={{
        width:           CARD_W,
        borderRadius:    RADIUS.xl,
        overflow:        'hidden',
        borderWidth:     1,
        borderColor:     COLORS.border,
        backgroundColor: COLORS.backgroundCard,
      }}
    >
      {/* Slide preview */}
      <View style={{ borderRadius: 0, overflow: 'hidden', position: 'relative' }}>
        <SlideCard slide={previewSlide} tokens={tokens} scale={CARD_SCALE} />

        {/* Tag overlay */}
        {template.tag && (
          <View style={{
            position:        'absolute',
            top:             6,
            right:           6,
            backgroundColor: accentColor,
            borderRadius:    RADIUS.full,
            paddingHorizontal: 7,
            paddingVertical:   2,
          }}>
            <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '800' }}>{template.tag}</Text>
          </View>
        )}

        {/* Slide count badge */}
        <View style={{
          position:        'absolute',
          bottom:          6,
          left:            6,
          flexDirection:   'row',
          alignItems:      'center',
          gap:             3,
          backgroundColor: 'rgba(0,0,0,0.6)',
          borderRadius:    RADIUS.full,
          paddingHorizontal: 7,
          paddingVertical:   2,
        }}>
          <Ionicons name="layers-outline" size={9} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '700' }}>{template.slideCount}</Text>
        </View>
      </View>

      {/* Card footer */}
      <LinearGradient
        colors={[template.gradient[0] + '15', template.gradient[1] + '08']}
        style={{ padding: SPACING.sm, gap: 2 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{
            width:           20,
            height:          20,
            borderRadius:    6,
            backgroundColor: template.gradient[0] + '30',
            alignItems:      'center',
            justifyContent:  'center',
            flexShrink:      0,
          }}>
            <Ionicons name={template.icon as any} size={11} color={template.gradient[0]} />
          </View>
          <Text numberOfLines={1} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '700', flex: 1 }}>
            {template.name}
          </Text>
        </View>
        <Text numberOfLines={2} style={{ color: COLORS.textMuted, fontSize: 9, lineHeight: 12 }}>
          {template.description}
        </Text>
      </LinearGradient>
    </Pressable>
  );
});

// ─── Template Detail Sheet ────────────────────────────────────────────────────

function TemplateDetailSheet({
  template,
  theme,
  activeSlideIndex,
  onApply,
  onInsert,
  onBack,
}: {
  template:         SlideTemplate;
  theme:            PresentationTheme;
  activeSlideIndex: number;
  onApply:          () => void;
  onInsert:         () => void;
  onBack:           () => void;
}) {
  const [previewIdx, setPreviewIdx] = useState(0);

  const tokens      = useMemo(() => getThemeTokens(template.suggestedTheme ?? theme), [template.suggestedTheme, theme]);
  const accentColor = tokens.primary;

  const previewSlides = useMemo(
    () => template.slides.map((ts, i) => templateSlideToPresSlide(ts, i, accentColor)),
    [template.slides, accentColor],
  );

  const currentSlide = previewSlides[previewIdx];
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      {/* Detail header */}
      <View style={{
        flexDirection:  'row',
        alignItems:     'center',
        paddingHorizontal: SPACING.lg,
        paddingVertical:   SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        gap:            SPACING.sm,
      }}>
        <Pressable
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </Pressable>

        <LinearGradient
          colors={template.gradient}
          style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <Ionicons name={template.icon as any} size={17} color="#FFF" />
        </LinearGradient>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
            {template.name}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
            {template.slideCount} slides
            {template.suggestedTheme ? ` · Best with ${THEME_LABELS[template.suggestedTheme]}` : ''}
          </Text>
        </View>

        {template.tag && (
          <LinearGradient
            colors={template.gradient}
            style={{ borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 }}
          >
            <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>{template.tag}</Text>
          </LinearGradient>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>

        {/* Main slide preview */}
        <Animated.View entering={FadeIn.duration(250)} style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.lg }}>
          <View style={{
            borderRadius:    14,
            overflow:        'hidden',
            borderWidth:     2,
            borderColor:     `${accentColor}50`,
            shadowColor:     accentColor,
            shadowOffset:    { width: 0, height: 6 },
            shadowOpacity:   0.3,
            shadowRadius:    18,
            elevation:       10,
          }}>
            <SlideCard slide={currentSlide} tokens={tokens} scale={DETAIL_SCALE} />
          </View>

          {/* Slide number + layout badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.sm }}>
            <View style={{
              flexDirection:   'row',
              alignItems:      'center',
              gap:             5,
              backgroundColor: `${accentColor}18`,
              borderRadius:    RADIUS.full,
              paddingHorizontal: 10,
              paddingVertical:   4,
              borderWidth:     1,
              borderColor:     `${accentColor}35`,
            }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor }} />
              <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                {currentSlide.layout.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {previewIdx + 1} / {template.slideCount}
            </Text>
          </View>
        </Animated.View>

        {/* Thumbnail strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.sm }}
          style={{ marginTop: SPACING.sm }}
        >
          {previewSlides.map((slide, i) => (
            <Pressable key={i} onPress={() => setPreviewIdx(i)}>
              <View style={{
                borderRadius:  6,
                overflow:      'hidden',
                borderWidth:   2,
                borderColor:   i === previewIdx ? accentColor : 'transparent',
                shadowColor:   i === previewIdx ? accentColor : '#000',
                shadowOffset:  { width: 0, height: 2 },
                shadowOpacity: i === previewIdx ? 0.4 : 0.1,
                shadowRadius:  6,
                elevation:     i === previewIdx ? 6 : 2,
              }}>
                <SlideCard slide={slide} tokens={tokens} scale={THUMB_SCALE} />
              </View>
              <Text style={{
                color:      i === previewIdx ? accentColor : COLORS.textMuted,
                fontSize:   9,
                textAlign:  'center',
                marginTop:  3,
                fontWeight: i === previewIdx ? '700' : '500',
              }}>{i + 1}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Template info card */}
        <View style={{ marginHorizontal: SPACING.lg, gap: SPACING.md }}>
          <LinearGradient
            colors={[template.gradient[0] + '12', template.gradient[1] + '08']}
            style={{
              borderRadius:  RADIUS.xl,
              padding:       SPACING.md,
              borderWidth:   1,
              borderColor:   template.gradient[0] + '25',
              gap:           SPACING.sm,
            }}
          >
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 20 }}>
              {template.description}
            </Text>

            {/* Slide list */}
            <View style={{ gap: 4 }}>
              {template.slides.map((ts, i) => (
                <Pressable
                  key={i}
                  onPress={() => setPreviewIdx(i)}
                  style={{
                    flexDirection:   'row',
                    alignItems:      'center',
                    gap:             SPACING.sm,
                    paddingVertical: 6,
                    paddingHorizontal: SPACING.sm,
                    backgroundColor: i === previewIdx ? `${accentColor}15` : 'transparent',
                    borderRadius:    RADIUS.md,
                  }}
                >
                  <View style={{
                    width:           22,
                    height:          22,
                    borderRadius:    6,
                    backgroundColor: i === previewIdx ? accentColor : COLORS.backgroundElevated,
                    alignItems:      'center',
                    justifyContent:  'center',
                    flexShrink:      0,
                  }}>
                    <Text style={{ color: i === previewIdx ? '#FFF' : COLORS.textMuted, fontSize: 9, fontWeight: '800' }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: i === previewIdx ? COLORS.textPrimary : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                      {ts.title}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {ts.layout.replace('_', ' ')}
                    </Text>
                  </View>
                  {i === previewIdx && <Ionicons name="eye-outline" size={14} color={accentColor} />}
                </Pressable>
              ))}
            </View>
          </LinearGradient>

          {/* Speaker notes preview */}
          {currentSlide.speakerNotes && (
            <View style={{ backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.info}25` }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Ionicons name="reader-outline" size={13} color={COLORS.info} />
                <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Speaker Notes — Slide {previewIdx + 1}
                </Text>
              </View>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 17, fontStyle: 'italic' }}>
                {currentSlide.speakerNotes}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Action bar */}
      <View style={{
        position:          'absolute',
        bottom:            0,
        left:              0,
        right:             0,
        paddingHorizontal: SPACING.lg,
        paddingTop:        SPACING.md,
        paddingBottom:     insets.bottom + SPACING.md,
        backgroundColor:   COLORS.backgroundCard,
        borderTopWidth:    1,
        borderTopColor:    COLORS.border,
        gap:               SPACING.sm,
      }}>

        {/* Insert (non-destructive) */}
        <TouchableOpacity
          onPress={onInsert}
          activeOpacity={0.8}
          style={{
            borderRadius:    RADIUS.full,
            paddingVertical: 14,
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             8,
            backgroundColor: `${accentColor}18`,
            borderWidth:     1.5,
            borderColor:     `${accentColor}50`,
          }}
        >
          <Ionicons name="add-circle-outline" size={19} color={accentColor} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
              Insert {template.slideCount} Slides After Current
            </Text>
            <Text style={{ color: `${accentColor}AA`, fontSize: 10, marginTop: 1 }}>
              After slide {activeSlideIndex + 1} · Non-destructive
            </Text>
          </View>
        </TouchableOpacity>

        {/* Apply (replaces all) */}
        <TouchableOpacity onPress={onApply} activeOpacity={0.8}>
          <LinearGradient
            colors={template.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              borderRadius:    RADIUS.full,
              paddingVertical: 14,
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             8,
              ...SHADOWS.medium,
            }}
          >
            <Ionicons name="copy-outline" size={19} color="#FFF" />
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                Apply Entire Template
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 1 }}>
                Replaces all slides · Can be undone
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Template Library Component ─────────────────────────────────────────

export function TemplateLibrary({
  visible,
  currentTheme,
  activeSlideIndex,
  presentationId,
  onApplyTemplate,
  onInsertTemplate,
  onClose,
}: TemplateLibraryProps) {
  const insets = useSafeAreaInsets();

  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [detailTemplate, setDetailTemplate] = useState<SlideTemplate | null>(null);
  const [searchQuery,    setSearchQuery]    = useState('');

  const allCategoryTabs = useMemo<LibraryCategoryMeta[]>(
    () => [
      { id: 'all' as const, label: 'All', emoji: '✨', description: 'All templates' },
      ...TEMPLATE_CATEGORIES,
    ],
    [],
  );

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    let list = activeCategory === 'all'
      ? SLIDE_TEMPLATES
      : getTemplatesByCategory(activeCategory as TemplateCategory);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeCategory, searchQuery]);

  const handleOpenDetail = useCallback((template: SlideTemplate) => {
    setDetailTemplate(template);
  }, []);

  const handleApply = useCallback(() => {
    if (!detailTemplate) return;
    onApplyTemplate(detailTemplate);
    setDetailTemplate(null);
    onClose();
  }, [detailTemplate, onApplyTemplate, onClose]);

  const handleInsert = useCallback(() => {
    if (!detailTemplate) return;
    onInsertTemplate(detailTemplate);
    setDetailTemplate(null);
    onClose();
  }, [detailTemplate, onInsertTemplate, onClose]);

  const handleBack = useCallback(() => {
    setDetailTemplate(null);
  }, []);

  const renderTemplate = useCallback(({ item }: { item: SlideTemplate }) => (
    <TemplateGridCard
      template={item}
      theme={currentTheme}
      onPress={handleOpenDetail}
    />
  ), [currentTheme, handleOpenDetail]);

  const renderSeparator = useCallback(() => (
    <View style={{ height: CARD_GAP }} />
  ), []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        onPress={!detailTemplate ? onClose : undefined}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor:      COLORS.backgroundCard,
            borderTopLeftRadius:  24,
            borderTopRightRadius: 24,
            maxHeight:            SCREEN_H * 0.95,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
            flex:                 1,
            marginTop:            SCREEN_H * 0.05,
          }}
        >
          {/* ── Detail view ── */}
          {detailTemplate ? (
            <TemplateDetailSheet
              template={detailTemplate}
              theme={currentTheme}
              activeSlideIndex={activeSlideIndex}
              onApply={handleApply}
              onInsert={handleInsert}
              onBack={handleBack}
            />
          ) : (
            <>
              {/* Handle */}
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: 10, marginBottom: SPACING.sm }} />

              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
                <LinearGradient
                  colors={['#43E97B', '#38F9D7']}
                  style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}
                >
                  <Ionicons name="copy-outline" size={17} color="#FFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                    Template Library
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    {TEMPLATE_COUNT} professional templates across 8 categories
                  </Text>
                </View>
                <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={COLORS.textMuted} />
                </Pressable>
              </View>

              {/* Category tabs */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm }}
              >
                {allCategoryTabs.map(cat => {
                  const active = activeCategory === cat.id;
                  const count  = cat.id === 'all' ? TEMPLATE_COUNT : getTemplatesByCategory(cat.id as TemplateCategory).length;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setActiveCategory(cat.id)}
                      style={{
                        flexDirection:     'row',
                        alignItems:        'center',
                        gap:               5,
                        backgroundColor:   active ? `${COLORS.primary}18` : COLORS.backgroundElevated,
                        borderRadius:      RADIUS.full,
                        paddingHorizontal: 12,
                        paddingVertical:   8,
                        borderWidth:       1,
                        borderColor:       active ? COLORS.primary : COLORS.border,
                      }}
                    >
                      <Text style={{ fontSize: 12 }}>{cat.emoji}</Text>
                      <Text style={{
                        color:      active ? COLORS.primary : COLORS.textSecondary,
                        fontSize:   FONTS.sizes.xs,
                        fontWeight: active ? '700' : '500',
                      }}>
                        {cat.label}
                      </Text>
                      <View style={{
                        backgroundColor: active ? COLORS.primary : COLORS.backgroundCard,
                        borderRadius:    RADIUS.full,
                        paddingHorizontal: 5,
                        paddingVertical:   1,
                        minWidth:        18,
                        alignItems:      'center',
                      }}>
                        <Text style={{ color: active ? '#FFF' : COLORS.textMuted, fontSize: 8, fontWeight: '800' }}>
                          {count}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: COLORS.border, marginBottom: SPACING.sm }} />

              {/* No results */}
              {filteredTemplates.length === 0 && (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md }}>
                  <Ionicons name="search-outline" size={40} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center' }}>
                    No templates found{'\n'}Try a different category
                  </Text>
                </View>
              )}

              {/* Template grid */}
              {filteredTemplates.length > 0 && (
                <FlatList
                  data={filteredTemplates}
                  keyExtractor={item => item.id}
                  renderItem={renderTemplate}
                  numColumns={GRID_COLS}
                  ItemSeparatorComponent={renderSeparator}
                  columnWrapperStyle={{ gap: CARD_GAP, paddingHorizontal: SPACING.lg }}
                  contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xl, paddingTop: SPACING.xs }}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={6}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                />
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}