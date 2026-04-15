// src/components/editor/AIEditPanel.tsx
// Part 41.9 — Two fixes:
//   Fix #2: stats layout now shows per-stat AI rewrite in Rewrite tab
//           (rewrite value, rewrite label, rewrite both via AI).
//   Fix #3: Generate Slide tab TextInput now avoids keyboard on both
//           iOS and Android using KeyboardAvoidingView + ScrollView combo.
// All other logic identical to previous version.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView,
  TextInput, ActivityIndicator, Dimensions,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient }     from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import { useSafeAreaInsets }  from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { AI_REWRITE_OPTIONS, EDITOR_CREDIT_COSTS }  from '../../constants/editor';
import type { EditableFieldKey, AIRewriteStyle, AIGenerateSlideRequest } from '../../types/editor';
import type { PresentationSlide, SlideLayout }                           from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_H = Dimensions.get('window').height;

const REWRITABLE_FIELDS: Record<string, EditableFieldKey[]> = {
  title:       ['title', 'subtitle', 'badgeText'],
  agenda:      ['title'],
  section:     ['title', 'sectionTag'],
  content:     ['title', 'body'],
  bullets:     ['title'],
  stats:       ['title'],
  quote:       ['title', 'quote', 'quoteAttribution'],
  chart_ref:   ['title', 'body'],
  predictions: ['title'],
  references:  ['title'],
  closing:     ['title', 'subtitle'],
};

const FIELD_LABELS: Partial<Record<EditableFieldKey, string>> = {
  title: 'Title', subtitle: 'Subtitle', body: 'Body',
  badgeText: 'Badge', sectionTag: 'Section Tag',
  quote: 'Quote', quoteAttribution: 'Attribution', speakerNotes: 'Speaker Notes',
};

const LAYOUT_LABELS: Record<string, string> = {
  title:'Title Slide', agenda:'Agenda', section:'Section Break',
  content:'Content', bullets:'Key Points', stats:'Statistics',
  quote:'Pull Quote', chart_ref:'Chart & Analysis',
  predictions:'Future Outlook', references:'References', closing:'Closing',
};

const BULLET_LAYOUTS = ['bullets', 'agenda', 'predictions', 'references'];

type AITab = 'rewrite' | 'generate' | 'notes' | 'layout';

interface AITabMeta {
  id:          AITab;
  label:       string;
  icon:        string;
  gradient:    readonly [string, string];
  cost:        number;
  description: string;
}

const AI_TABS: AITabMeta[] = [
  { id: 'rewrite',  label: 'Rewrite',   icon: 'pencil',   gradient: ['#6C63FF','#8B5CF6'], cost: EDITOR_CREDIT_COSTS.ai_rewrite,  description: 'Rewrite any field in a different style' },
  { id: 'generate', label: 'New Slide', icon: 'sparkles', gradient: ['#FF6584','#F093FB'], cost: EDITOR_CREDIT_COSTS.ai_generate, description: 'Describe a slide and AI creates it' },
  { id: 'notes',    label: 'Notes',     icon: 'reader',   gradient: ['#43E97B','#38F9D7'], cost: EDITOR_CREDIT_COSTS.ai_notes,    description: 'Auto-write presenter notes' },
  { id: 'layout',   label: 'Layout AI', icon: 'grid',     gradient: ['#FFA726','#FF7043'], cost: EDITOR_CREDIT_COSTS.ai_layout,   description: 'AI suggests a better layout (free)' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface AIEditPanelProps {
  visible:                   boolean;
  isProcessing:              boolean;
  processingLabel:           string;
  selectedField:             EditableFieldKey | null;
  selectedFieldValue:        string;
  currentSlide:              PresentationSlide | null;
  currentSlideIndex:         number;
  totalSlides:               number;
  balance:                   number;
  layoutSuggestion:          { suggestedLayout: SlideLayout; reason: string } | null;
  onRewriteField:            (field: EditableFieldKey, style: AIRewriteStyle) => void;
  onRewriteBullets:          (style: AIRewriteStyle) => void;
  onRewriteSingleBullet:     (bulletIndex: number, style: AIRewriteStyle) => void;
  /** Part 41.9 Fix #2 — AI rewrite of a single stat's value or label */
  onRewriteStat?:            (statIndex: number, field: 'value' | 'label', style: AIRewriteStyle) => void;
  onGenerateSlide:           (req: AIGenerateSlideRequest) => void;
  onGenerateSpeakerNotes:    () => void;
  onSuggestLayout:           () => void;
  onApplyLayoutSuggestion:   () => void;
  onDismissLayoutSuggestion: () => void;
  onClose:                   () => void;
}

// ─── Bullet rewrite row ───────────────────────────────────────────────────────

function BulletRewriteRow({
  bulletIndex, text, accentColor, canAfford, onRewrite,
}: {
  bulletIndex:  number;
  text:         string;
  accentColor:  string;
  canAfford:    boolean;
  onRewrite:    (idx: number, style: AIRewriteStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm }}>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: accentColor, flexShrink: 0 }} />
        <Text style={{ flex: 1, color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 18 }} numberOfLines={2}>{text || `Bullet ${bulletIndex + 1} (empty)`}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textMuted} />
      </Pressable>
      {open && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, padding: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: `${accentColor}06` }}>
          {AI_REWRITE_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.id} onPress={() => { if (canAfford) { onRewrite(bulletIndex, opt.id); setOpen(false); } }} disabled={!canAfford || !text.trim()} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${opt.gradient[0]}18`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: `${opt.gradient[0]}35`, opacity: canAfford && text.trim() ? 1 : 0.4 }}>
              <Ionicons name={opt.icon as any} size={12} color={opt.gradient[0]} />
              <Text style={{ color: opt.gradient[0], fontSize: 10, fontWeight: '700' }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Part 41.9 Fix #2: Stat Rewrite Row ──────────────────────────────────────

function StatRewriteRow({
  statIndex,
  statValue,
  statLabel,
  accentColor,
  canAfford,
  onRewrite,
}: {
  statIndex:   number;
  statValue:   string;
  statLabel:   string;
  accentColor: string;
  canAfford:   boolean;
  onRewrite:   (statIdx: number, field: 'value' | 'label', style: AIRewriteStyle) => void;
}) {
  const [open,        setOpen]        = useState(false);
  const [activeField, setActiveField] = useState<'value' | 'label'>('label');
  const statColor = accentColor;

  return (
    <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' }}>
      {/* Stat preview row */}
      <Pressable onPress={() => setOpen(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statColor, flexShrink: 0 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: statColor, fontSize: FONTS.sizes.base, fontWeight: '900' }} numberOfLines={1}>{statValue || '—'}</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }} numberOfLines={1}>{statLabel || `Stat ${statIndex + 1} (no label)`}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textMuted} />
      </Pressable>

      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: `${statColor}06`, padding: SPACING.sm, gap: SPACING.sm }}>
          {/* Field selector: value or label */}
          <View style={{ flexDirection: 'row', backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: 3, borderWidth: 1, borderColor: COLORS.border }}>
            {(['value', 'label'] as const).map(f => (
              <Pressable key={f} onPress={() => setActiveField(f)} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: RADIUS.md, backgroundColor: activeField === f ? `${statColor}20` : 'transparent' }}>
                <Text style={{ color: activeField === f ? statColor : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                  {f === 'value' ? `Rewrite Value "${statValue || '—'}"` : `Rewrite Label "${statLabel || '…'}"`.slice(0, 28)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Rewrite style buttons */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs }}>
            {AI_REWRITE_OPTIONS.map(opt => {
              const fieldText = activeField === 'value' ? statValue : statLabel;
              const disabled  = !canAfford || !fieldText.trim();
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => { if (!disabled) { onRewrite(statIndex, activeField, opt.id); setOpen(false); } }}
                  disabled={disabled}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${opt.gradient[0]}18`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: `${opt.gradient[0]}35`, opacity: disabled ? 0.4 : 1 }}
                >
                  <Ionicons name={opt.icon as any} size={12} color={opt.gradient[0]} />
                  <Text style={{ color: opt.gradient[0], fontSize: 10, fontWeight: '700' }}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!canAfford && (
            <Text style={{ color: COLORS.error, fontSize: 10 }}>Need {EDITOR_CREDIT_COSTS.ai_rewrite} credit to rewrite.</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AIEditPanel({
  visible, isProcessing, processingLabel,
  selectedField, selectedFieldValue,
  currentSlide, currentSlideIndex, totalSlides,
  balance, layoutSuggestion,
  onRewriteField, onRewriteBullets, onRewriteSingleBullet,
  onRewriteStat,
  onGenerateSlide, onGenerateSpeakerNotes,
  onSuggestLayout, onApplyLayoutSuggestion, onDismissLayoutSuggestion,
  onClose,
}: AIEditPanelProps) {
  const insets = useSafeAreaInsets();

  const [activeTab,   setActiveTab]   = useState<AITab>('rewrite');
  const [genPrompt,   setGenPrompt]   = useState('');
  const [insertAfter, setInsertAfter] = useState<'before' | 'after'>('after');
  const [pickedField, setPickedField] = useState<EditableFieldKey | null>(null);
  const [bulletMode,  setBulletMode]  = useState<'all' | 'individual'>('all');

  const effectiveField = pickedField ?? selectedField;
  const effectiveValue = pickedField
    ? ((currentSlide as any)?.[pickedField] as string | undefined) ?? ''
    : selectedFieldValue;

  const availableFields: EditableFieldKey[] = currentSlide
    ? (REWRITABLE_FIELDS[currentSlide.layout] ?? ['title'])
    : ['title'];

  const hasBullets     = !!(currentSlide?.bullets?.length);
  const isBulletLayout = currentSlide ? BULLET_LAYOUTS.includes(currentSlide.layout) : false;
  const isStatsLayout  = currentSlide?.layout === 'stats';
  const hasStats       = !!(currentSlide?.stats?.length);

  const handleGenerate = useCallback(() => {
    if (!genPrompt.trim()) return;
    onGenerateSlide({ description: genPrompt.trim(), insertAfterIdx: insertAfter === 'after' ? currentSlideIndex : currentSlideIndex - 1 });
    setGenPrompt('');
  }, [genPrompt, insertAfter, currentSlideIndex, onGenerateSlide]);

  const handleRewriteField = useCallback((style: AIRewriteStyle) => {
    if (!effectiveField) return;
    onRewriteField(effectiveField, style);
    setPickedField(null);
  }, [effectiveField, onRewriteField]);

  const canAffordRewrite  = balance >= EDITOR_CREDIT_COSTS.ai_rewrite;
  const canAffordGenerate = balance >= EDITOR_CREDIT_COSTS.ai_generate;
  const canAffordNotes    = balance >= EDITOR_CREDIT_COSTS.ai_notes;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }} onPress={!isProcessing ? onClose : undefined}>
        {/* Part 41.9 Fix #3: wrap entire panel in KeyboardAvoidingView */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              backgroundColor:      COLORS.backgroundCard,
              borderTopLeftRadius:  24,
              borderTopRightRadius: 24,
              paddingTop:           SPACING.sm,
              paddingBottom:        insets.bottom + SPACING.md,
              maxHeight:            SCREEN_H * 0.90,
              borderTopWidth:       1,
              borderTopColor:       COLORS.border,
              overflow:             'hidden',
            }}
          >
            {/* Processing overlay */}
            {isProcessing && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,26,0.93)', zIndex: 99, alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                <LinearGradient colors={['#6C63FF','#8B5CF6']} style={{ width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', ...SHADOWS.large }}>
                  <Ionicons name="sparkles" size={34} color="#FFF" />
                </LinearGradient>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', textAlign: 'center' }}>{processingLabel || 'AI is working…'}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Usually 5–15 seconds</Text>
              </View>
            )}

            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
              <LinearGradient colors={['#6C63FF','#8B5CF6']} style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}>
                <Ionicons name="sparkles" size={17} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>AI Editing Tools</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <Ionicons name="flash" size={11} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{balance} credits available</Text>
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </Pressable>
            </View>

            {/* Layout suggestion banner */}
            {layoutSuggestion && (
              <Animated.View entering={FadeInDown.duration(300)} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: `${COLORS.warning}12`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.warning}35` }}>
                <Ionicons name="bulb-outline" size={18} color={COLORS.warning} style={{ flexShrink: 0 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 2 }}>Try: {LAYOUT_LABELS[layoutSuggestion.suggestedLayout] ?? layoutSuggestion.suggestedLayout}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{layoutSuggestion.reason}</Text>
                </View>
                <View style={{ flexDirection: 'column', gap: 6 }}>
                  <Pressable onPress={onApplyLayoutSuggestion} style={{ backgroundColor: COLORS.warning, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Apply</Text>
                  </Pressable>
                  <Pressable onPress={onDismissLayoutSuggestion} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center' }}>Dismiss</Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* Tab strip */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.md }}>
              {AI_TABS.map(tab => {
                const active = activeTab === tab.id;
                const canAff = tab.cost === 0 || balance >= tab.cost;
                return (
                  <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: active ? `${tab.gradient[0]}18` : COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: active ? tab.gradient[0] : COLORS.border }}>
                    <Ionicons name={tab.icon as any} size={13} color={active ? tab.gradient[0] : COLORS.textMuted} />
                    <Text style={{ color: active ? tab.gradient[0] : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: active ? '700' : '500' }}>{tab.label}</Text>
                    {tab.cost > 0 && (
                      <View style={{ backgroundColor: canAff ? `${tab.gradient[0]}20` : `${COLORS.error}20`, borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ color: canAff ? tab.gradient[0] : COLORS.error, fontSize: 8, fontWeight: '700' }}>{tab.cost}cr</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Tab content */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.md }}
            >

              {/* ── REWRITE TAB ── */}
              {activeTab === 'rewrite' && (
                <>
                  {/* ── STATS LAYOUT: Mode toggle ── */}
                  {isStatsLayout && hasStats && (
                    <>
                      {/* Stats section header */}
                      <View style={{ backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25`, borderLeftWidth: 3, borderLeftColor: COLORS.primary, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="stats-chart-outline" size={14} color={COLORS.primary} />
                          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>
                            AI Rewrite Stats ({currentSlide!.stats!.length} stats)
                          </Text>
                        </View>
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                          Expand any stat below to rewrite its value or label using AI.
                        </Text>
                      </View>

                      {/* Per-stat rewrite rows */}
                      <View style={{ gap: SPACING.sm }}>
                        {currentSlide!.stats!.map((stat, i) => (
                          <StatRewriteRow
                            key={i}
                            statIndex={i}
                            statValue={stat.value}
                            statLabel={stat.label}
                            accentColor={stat.color ?? COLORS.primary}
                            canAfford={canAffordRewrite}
                            onRewrite={(idx, field, style) => onRewriteStat?.(idx, field, style)}
                          />
                        ))}
                      </View>

                      {!canAffordRewrite && (
                        <View style={{ backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                          <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 }}>Need at least 1 credit. Go to Profile → Credits to top up.</Text>
                        </View>
                      )}

                      {/* Divider before title rewrite */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.xs }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>Also rewrite title</Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                      </View>

                      {/* Title rewrite chips for stats layout */}
                      <View style={{ flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' }}>
                        {AI_REWRITE_OPTIONS.map(opt => {
                          const titleVal = (currentSlide as any)?.title ?? '';
                          const disabled = !titleVal.trim() || !canAffordRewrite;
                          return (
                            <TouchableOpacity key={opt.id} onPress={() => !disabled && onRewriteField('title', opt.id)} disabled={disabled} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${opt.gradient[0]}15`, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: `${opt.gradient[0]}30`, opacity: disabled ? 0.4 : 1 }}>
                              <Ionicons name={opt.icon as any} size={12} color={opt.gradient[0]} />
                              <Text style={{ color: opt.gradient[0], fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Title: {opt.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {/* ── BULLET layouts ── */}
                  {isBulletLayout && hasBullets && (
                    <>
                      <View style={{ flexDirection: 'row', backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: 3, borderWidth: 1, borderColor: COLORS.border }}>
                        {(['all', 'individual'] as const).map(mode => (
                          <Pressable key={mode} onPress={() => setBulletMode(mode)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADIUS.lg, backgroundColor: bulletMode === mode ? COLORS.primary : 'transparent' }}>
                            <Text style={{ color: bulletMode === mode ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{mode === 'all' ? '✦ All Bullets' : '⊞ Per Bullet'}</Text>
                          </Pressable>
                        ))}
                      </View>

                      {bulletMode === 'all' && (
                        <>
                          <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30`, borderLeftWidth: 3, borderLeftColor: COLORS.primary, gap: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <Ionicons name="list-outline" size={13} color={COLORS.primary} />
                              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>{currentSlide!.bullets!.length} bullets — rewrite all at once</Text>
                            </View>
                            {currentSlide!.bullets!.slice(0, 4).map((b, i) => (
                              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.primary, marginTop: 6, flexShrink: 0 }} />
                                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 16, flex: 1 }} numberOfLines={2}>{b}</Text>
                              </View>
                            ))}
                            {currentSlide!.bullets!.length > 4 && <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>+{currentSlide!.bullets!.length - 4} more…</Text>}
                          </View>
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Choose rewrite style — applies to ALL bullets</Text>
                          <View style={{ gap: SPACING.sm }}>
                            {AI_REWRITE_OPTIONS.map(opt => {
                              const disabled = !canAffordRewrite;
                              return (
                                <TouchableOpacity key={opt.id} onPress={() => !disabled && onRewriteBullets(opt.id)} disabled={disabled} activeOpacity={0.75} style={{ opacity: disabled ? 0.45 : 1 }}>
                                  <LinearGradient colors={opt.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.xl, padding: SPACING.md, gap: SPACING.md }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <Ionicons name={opt.icon as any} size={20} color="#FFF" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800', marginBottom: 2 }}>{opt.label}</Text>
                                      <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.xs }}>{opt.description}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 }}>
                                      <Ionicons name="flash" size={10} color="#FFF" />
                                      <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>1 cr</Text>
                                    </View>
                                  </LinearGradient>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </>
                      )}

                      {bulletMode === 'individual' && (
                        <>
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Tap any bullet to expand its rewrite options</Text>
                          <View style={{ gap: SPACING.sm }}>
                            {currentSlide!.bullets!.map((bullet, i) => (
                              <BulletRewriteRow key={i} bulletIndex={i} text={bullet} accentColor={COLORS.primary} canAfford={canAffordRewrite} onRewrite={onRewriteSingleBullet} />
                            ))}
                          </View>
                          {!canAffordRewrite && (
                            <View style={{ backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                              <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 }}>Need at least 1 credit to rewrite.</Text>
                            </View>
                          )}
                        </>
                      )}

                      {/* Also rewrite title for bullet layouts */}
                      {availableFields.includes('title') && (
                        <View style={{ gap: SPACING.sm, marginTop: SPACING.sm }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                            <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>Also rewrite title</Text>
                            <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
                          </View>
                          <View style={{ flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' }}>
                            {AI_REWRITE_OPTIONS.map(opt => {
                              const titleVal = (currentSlide as any)?.title ?? '';
                              const disabled = !titleVal.trim() || !canAffordRewrite;
                              return (
                                <TouchableOpacity key={opt.id} onPress={() => !disabled && onRewriteField('title', opt.id)} disabled={disabled} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${opt.gradient[0]}15`, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: `${opt.gradient[0]}30`, opacity: disabled ? 0.4 : 1 }}>
                                  <Ionicons name={opt.icon as any} size={12} color={opt.gradient[0]} />
                                  <Text style={{ color: opt.gradient[0], fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Title: {opt.label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </>
                  )}

                  {/* ── TEXT FIELDS (non-bullet, non-stats layouts) ── */}
                  {!isBulletLayout && !hasBullets && !isStatsLayout && (
                    <>
                      <View>
                        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm }}>Select Field to Rewrite</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
                          {availableFields.map(field => {
                            const val      = ((currentSlide as any)?.[field] as string | undefined) ?? '';
                            const isPicked = effectiveField === field;
                            const hasVal   = val.trim().length > 0;
                            return (
                              <Pressable key={field} onPress={() => setPickedField(field)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: isPicked ? `${COLORS.primary}18` : COLORS.backgroundElevated, borderWidth: 1.5, borderColor: isPicked ? COLORS.primary : COLORS.border, gap: 3, alignItems: 'center' }}>
                                <Text style={{ color: isPicked ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: isPicked ? '700' : '500' }}>{FIELD_LABELS[field] ?? field}</Text>
                                {!hasVal && <Text style={{ color: COLORS.textMuted, fontSize: 8 }}>empty</Text>}
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>

                      {effectiveField && effectiveValue ? (
                        <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30`, borderLeftWidth: 3, borderLeftColor: COLORS.primary }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Ionicons name="text-outline" size={13} color={COLORS.primary} />
                            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>{FIELD_LABELS[effectiveField] ?? effectiveField} — current text</Text>
                          </View>
                          <Text numberOfLines={3} style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 18, fontStyle: 'italic' }}>"{effectiveValue.slice(0, 160)}{effectiveValue.length > 160 ? '…' : ''}"</Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 6 }}>
                          <Ionicons name="information-circle-outline" size={22} color={COLORS.textMuted} />
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center' }}>{effectiveField ? 'This field is empty. Add some text first.' : 'Pick a field above to rewrite it.'}</Text>
                        </View>
                      )}

                      <View style={{ gap: SPACING.sm }}>
                        {AI_REWRITE_OPTIONS.map(opt => {
                          const disabled = !effectiveField || !effectiveValue.trim() || !canAffordRewrite;
                          return (
                            <TouchableOpacity key={opt.id} onPress={() => !disabled && handleRewriteField(opt.id)} disabled={disabled} activeOpacity={disabled ? 1 : 0.75} style={{ opacity: disabled ? 0.45 : 1 }}>
                              <LinearGradient colors={opt.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.xl, padding: SPACING.md, gap: SPACING.md }}>
                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Ionicons name={opt.icon as any} size={22} color="#FFF" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800', marginBottom: 2 }}>{opt.label}</Text>
                                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.xs }}>{opt.description}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 }}>
                                  <Ionicons name="flash" size={10} color="#FFF" />
                                  <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{opt.cost} cr</Text>
                                </View>
                              </LinearGradient>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {!canAffordRewrite && (
                        <View style={{ backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                          <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 }}>Need at least 1 credit to rewrite. Go to Profile → Credits to top up.</Text>
                        </View>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ── GENERATE SLIDE TAB ── */}
              {activeTab === 'generate' && (
                <>
                  {/* Part 41.9 Fix #3: TextInput is now inside a view that
                      works with the outer KeyboardAvoidingView so it slides
                      above the keyboard on both iOS and Android. */}
                  <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: 6 }}>Describe the slide you want</Text>
                    <TextInput
                      value={genPrompt}
                      onChangeText={setGenPrompt}
                      placeholder={'e.g. "A statistics slide showing top 3 market growth figures"'}
                      placeholderTextColor={COLORS.textMuted}
                      multiline
                      numberOfLines={4}
                      returnKeyType="default"
                      blurOnSubmit={false}
                      style={{
                        color:             COLORS.textPrimary,
                        fontSize:          FONTS.sizes.sm,
                        minHeight:         90,
                        textAlignVertical: 'top',
                        lineHeight:        20,
                      }}
                    />
                    {genPrompt.length > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                        <Text style={{ color: genPrompt.length < 10 ? COLORS.warning : COLORS.success, fontSize: 9 }}>
                          {genPrompt.length < 10 ? `${10 - genPrompt.length} more chars needed` : '✓ Ready to generate'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm }}>Insert Position</Text>
                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      {(['after', 'before'] as const).map(pos => (
                        <Pressable key={pos} onPress={() => setInsertAfter(pos)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RADIUS.lg, backgroundColor: insertAfter === pos ? `${COLORS.primary}18` : COLORS.backgroundElevated, borderWidth: 1.5, borderColor: insertAfter === pos ? COLORS.primary : COLORS.border }}>
                          <Ionicons name={pos === 'after' ? 'arrow-forward-outline' : 'arrow-back-outline'} size={14} color={insertAfter === pos ? COLORS.primary : COLORS.textMuted} />
                          <Text style={{ color: insertAfter === pos ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{pos === 'after' ? `After slide ${currentSlideIndex + 1}` : `Before slide ${currentSlideIndex + 1}`}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <TouchableOpacity onPress={handleGenerate} disabled={genPrompt.trim().length < 5 || !canAffordGenerate} activeOpacity={0.75} style={{ opacity: genPrompt.trim().length < 5 || !canAffordGenerate ? 0.45 : 1 }}>
                    <LinearGradient colors={['#FF6584','#F093FB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: RADIUS.full, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...SHADOWS.medium }}>
                      <Ionicons name="sparkles" size={18} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Generate Slide</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Ionicons name="flash" size={10} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{EDITOR_CREDIT_COSTS.ai_generate} cr</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>

                  {!canAffordGenerate && (
                    <View style={{ backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                      <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 }}>Need {EDITOR_CREDIT_COSTS.ai_generate} credits. You have {balance}.</Text>
                    </View>
                  )}
                </>
              )}

              {/* ── NOTES TAB ── */}
              {activeTab === 'notes' && (
                <>
                  {!currentSlide ? (
                    <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 8 }}>
                      <Ionicons name="alert-circle-outline" size={24} color={COLORS.textMuted} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center' }}>No slide selected. Navigate to a slide first.</Text>
                    </View>
                  ) : (
                    <>
                      <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <Ionicons name="reader-outline" size={16} color={COLORS.primary} />
                          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Slide {currentSlideIndex + 1} — {LAYOUT_LABELS[currentSlide.layout] ?? 'Slide'}</Text>
                        </View>
                        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 4 }}>{currentSlide.title ?? 'Untitled'}</Text>
                        {currentSlide.speakerNotes ? (
                          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 18, fontStyle: 'italic' }}>"{currentSlide.speakerNotes}"</Text>
                        ) : (
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>No speaker notes yet.</Text>
                        )}
                      </View>
                      <View style={{ backgroundColor: `${COLORS.success}10`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.success}25`, gap: 6 }}>
                        {['Natural, spoken language (2 sentences)', 'Grounded in your research report', 'Includes transition hint to next slide'].map((f, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>{f}</Text>
                          </View>
                        ))}
                      </View>
                      <TouchableOpacity onPress={onGenerateSpeakerNotes} disabled={!canAffordNotes} activeOpacity={0.75} style={{ opacity: canAffordNotes ? 1 : 0.45 }}>
                        <LinearGradient colors={['#43E97B','#38F9D7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: RADIUS.full, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...SHADOWS.medium }}>
                          <Ionicons name="reader" size={18} color="#FFF" />
                          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>{currentSlide.speakerNotes ? 'Regenerate Notes' : 'Generate Notes'}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Ionicons name="flash" size={10} color="#FFF" />
                            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{EDITOR_CREDIT_COSTS.ai_notes} cr</Text>
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                      {!canAffordNotes && <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, textAlign: 'center' }}>Need {EDITOR_CREDIT_COSTS.ai_notes} credit — you have {balance}.</Text>}
                    </>
                  )}
                </>
              )}

              {/* ── LAYOUT SUGGEST TAB ── */}
              {activeTab === 'layout' && (
                <>
                  <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
                      <Ionicons name="grid-outline" size={16} color={COLORS.primary} />
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Current: <Text style={{ color: COLORS.primary }}>{LAYOUT_LABELS[currentSlide?.layout ?? ''] ?? 'Unknown'}</Text></Text>
                    </View>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>AI analyzes your slide content and recommends the best layout from 11 options.</Text>
                  </View>

                  {layoutSuggestion && (
                    <Animated.View entering={FadeInDown.duration(300)} style={{ backgroundColor: `${COLORS.warning}12`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.warning}30` }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Ionicons name="bulb" size={18} color={COLORS.warning} />
                        <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>AI Suggestion</Text>
                      </View>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', marginBottom: 4 }}>Switch to: {LAYOUT_LABELS[layoutSuggestion.suggestedLayout] ?? layoutSuggestion.suggestedLayout}</Text>
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.md }}>{layoutSuggestion.reason}</Text>
                      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                        <TouchableOpacity onPress={onApplyLayoutSuggestion} style={{ flex: 2 }}>
                          <LinearGradient colors={[COLORS.warning,'#FF8F00']} style={{ borderRadius: RADIUS.full, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                            <Ionicons name="checkmark" size={16} color="#FFF" />
                            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>Apply Layout</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                        <Pressable onPress={onDismissLayoutSuggestion} style={{ flex: 1, paddingVertical: 11, borderRadius: RADIUS.full, alignItems: 'center', backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border }}>
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Dismiss</Text>
                        </Pressable>
                      </View>
                    </Animated.View>
                  )}

                  <TouchableOpacity onPress={onSuggestLayout} activeOpacity={0.75}>
                    <LinearGradient colors={['#FFA726','#FF7043']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: RADIUS.full, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...SHADOWS.medium }}>
                      <Ionicons name="bulb" size={18} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>{layoutSuggestion ? 'Analyze Again' : 'Analyze Layout'}</Text>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>FREE</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}