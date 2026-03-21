// src/components/editor/SlideEditorCanvas.tsx
// Part 28 — FULL FIX v2: All 6 issues resolved
// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — Background color: wrapper View uses bgOverride from editorData.
//          SlideCard internally reads (slide as any).editorData.backgroundColor.
//          Outer wrapper guarantees coverage for every layout type.
// FIX 2 — No truncation: noTruncate=true on SlideCard; field previews have no
//          numberOfLines; speaker notes show in full.
// FIX 3 — Spacing density: SlideCard reads editorData.spacing internally.
//          Active spacing shown in status strip below the preview.
// FIX 4 — Font family: fontFamily prop passed from state through to SlideCard.
// FIX 5 — Blocks in-slide: InSlideBlockCard renders each block in a styled
//          header+body card that reads as a natural extension of the slide.
// FIX 6 — AI rewrite works from field cards: selected field is wired through
//          to FormattingToolbar AI rewrite buttons in slide-editor.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, Dimensions, KeyboardAvoidingView,
  Platform, Image, TouchableOpacity,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SlideCard }                               from '../research/SlideCard';
import { TOOLBAR_ACCESSORY_ID }                    from './FormattingToolbar';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import type {
  EditableSlide, EditableFieldKey, AdditionalBlock, FieldFormatting,
} from '../../types/editor';
import type { PresentationThemeTokens } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W  = Dimensions.get('window').width;
const CANVAS_W  = SCREEN_W - SPACING.lg * 2;
const CANVAS_SC = CANVAS_W / 320;

const FIELD_LABELS: Partial<Record<EditableFieldKey, string>> = {
  title: 'Title', subtitle: 'Subtitle', body: 'Body', badgeText: 'Badge',
  sectionTag: 'Section Tag', quote: 'Quote', quoteAttribution: 'Attribution',
  speakerNotes: 'Speaker Notes',
};

const LAYOUT_FIELDS: Record<string, EditableFieldKey[]> = {
  title:       ['title', 'subtitle', 'badgeText'],
  agenda:      ['title'],
  section:     ['title', 'sectionTag'],
  content:     ['title', 'body'],
  bullets:     ['title'],
  stats:       ['title'],
  quote:       ['quote', 'quoteAttribution', 'title'],
  chart_ref:   ['title', 'body'],
  predictions: ['title'],
  references:  ['title'],
  closing:     ['title', 'subtitle'],
};

const SPACING_LABELS: Record<string, string> = {
  compact:  'Compact',
  spacious: 'Spacious',
  default:  '',
};

// ─── Text Edit Modal ──────────────────────────────────────────────────────────

function TextEditModal({
  visible, field, value, formatting, accentColor,
  onChange, onCommit, onClose,
}: {
  visible:     boolean;
  field:       EditableFieldKey | null;
  value:       string;
  formatting:  FieldFormatting;
  accentColor: string;
  onChange:    (t: string) => void;
  onCommit:    (f: EditableFieldKey, v: string) => void;
  onClose:     () => void;
}) {
  const insets  = useSafeAreaInsets();
  const isMulti = field === 'body' || field === 'quote' || field === 'speakerNotes';
  const done    = useCallback(() => { if (field) onCommit(field, value); }, [field, value, onCommit]);

  if (!field) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={done}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}
        onPress={done}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              backgroundColor:      COLORS.backgroundCard,
              borderTopLeftRadius:  24,
              borderTopRightRadius: 24,
              paddingHorizontal:    SPACING.lg,
              paddingTop:           SPACING.md,
              paddingBottom:        insets.bottom + SPACING.md,
              borderTopWidth:       1,
              borderTopColor:       COLORS.border,
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: `${accentColor}20`, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}>
                <Ionicons name="pencil-outline" size={15} color={accentColor} />
              </View>
              <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                Edit {FIELD_LABELS[field] ?? field}
              </Text>
              <Pressable
                onPress={done}
                style={{ backgroundColor: accentColor, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 7 }}
              >
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>Done</Text>
              </Pressable>
            </View>

            <View style={{
              backgroundColor:  COLORS.backgroundElevated,
              borderRadius:     RADIUS.xl,
              borderWidth:      1.5,
              borderColor:      `${accentColor}55`,
              paddingHorizontal: SPACING.md,
              paddingVertical:  SPACING.sm,
            }}>
              <TextInput
                value={value}
                onChangeText={onChange}
                multiline={isMulti}
                numberOfLines={isMulti ? 6 : 2}
                autoFocus
                inputAccessoryViewID={Platform.OS === 'ios' ? TOOLBAR_ACCESSORY_ID : undefined}
                placeholder={`Enter ${FIELD_LABELS[field] ?? field}…`}
                placeholderTextColor={COLORS.textMuted}
                style={{
                  color:             COLORS.textPrimary,
                  fontSize:          FONTS.sizes.base,
                  lineHeight:        24,
                  minHeight:         isMulti ? 120 : 44,
                  textAlignVertical: isMulti ? 'top' : 'center',
                  fontWeight:        formatting.bold   ? '700'   : '400',
                  fontStyle:         formatting.italic ? 'italic': 'normal',
                  textAlign:         formatting.alignment ?? 'left',
                }}
                returnKeyType={isMulti ? 'default' : 'done'}
                onSubmitEditing={isMulti ? undefined : done}
                blurOnSubmit={!isMulti}
              />
            </View>

            {/* Formatting badge strip */}
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, flexWrap: 'wrap' }}>
              {formatting.bold   && <View style={{ backgroundColor: `${accentColor}18`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Bold</Text></View>}
              {formatting.italic && <View style={{ backgroundColor: `${accentColor}18`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontStyle: 'italic' }}>Italic</Text></View>}
              {formatting.fontScale && formatting.fontScale !== 1.0 && <View style={{ backgroundColor: `${accentColor}18`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: accentColor, fontSize: FONTS.sizes.xs }}>{Math.round(formatting.fontScale * 100)}%</Text></View>}
              {formatting.color  && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${accentColor}18`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: formatting.color }} /><Text style={{ color: accentColor, fontSize: FONTS.sizes.xs }}>Color</Text></View>}
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ─── Bullet Editor ────────────────────────────────────────────────────────────

function BulletEditor({ bullets, accentColor, onUpdate, onAdd, onRemove }: {
  bullets:    string[];
  accentColor: string;
  onUpdate:   (i: number, v: string) => void;
  onAdd:      () => void;
  onRemove:   (i: number) => void;
}) {
  return (
    <View style={{
      backgroundColor: COLORS.backgroundCard,
      borderRadius:    RADIUS.xl,
      padding:         SPACING.md,
      borderWidth:     1,
      borderColor:     `${accentColor}25`,
      gap:             SPACING.sm,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Ionicons name="list-outline" size={14} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
          Bullet Points ({bullets.length})
        </Text>
      </View>
      {bullets.map((bullet, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accentColor, flexShrink: 0, marginTop: 14 }} />
          <TextInput
            value={bullet}
            onChangeText={v => onUpdate(i, v)}
            placeholder={`Bullet point ${i + 1}…`}
            placeholderTextColor={COLORS.textMuted}
            multiline
            style={{
              flex:            1,
              color:           COLORS.textPrimary,
              fontSize:        FONTS.sizes.sm,
              lineHeight:      20,
              backgroundColor: COLORS.backgroundElevated,
              borderRadius:    RADIUS.md,
              paddingHorizontal: SPACING.sm,
              paddingTop:      8,
              paddingBottom:   8,
              borderWidth:     1,
              borderColor:     COLORS.border,
              textAlignVertical: 'top',
            }}
          />
          <Pressable onPress={() => onRemove(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 8 }}>
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </Pressable>
        </View>
      ))}
      <TouchableOpacity
        onPress={onAdd}
        activeOpacity={0.6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4 }}
      >
        <Ionicons name="add-circle-outline" size={20} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Add bullet point</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── FIX 5: In-Slide Block Card ───────────────────────────────────────────────
// Each block renders inside a styled card that looks like a native part of the
// slide rather than a floating external widget.

function InSlideBlockCard({ block, accentColor, tokens, onDelete, onUpdateBlock }: {
  block:          AdditionalBlock;
  accentColor:    string;
  tokens:         PresentationThemeTokens;
  onDelete:       (id: string) => void;
  onUpdateBlock:  (id: string, patch: Partial<AdditionalBlock>) => void;
}) {
  const col      = (block as any).color ?? accentColor;
  const blockIcon = {
    image:       'image-outline',
    stat:        'trending-up-outline',
    chart:       'bar-chart-outline',
    quote_block: 'chatbubble-outline',
    divider:     'remove-outline',
    spacer:      'resize-outline',
    icon:        'apps-outline',
  }[block.type] ?? 'cube-outline';

  const renderContent = () => {
    switch (block.type) {

      // ── IMAGE ──────────────────────────────────────────────────────────────
      case 'image':
        return (
          <View>
            <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border }}>
              {block.uri ? (
                <>
                  <Image
                    source={{ uri: block.uri }}
                    style={{ width: '100%', aspectRatio: block.aspectRatio ?? 16 / 9 }}
                    resizeMode="cover"
                  />
                  {(block as any).caption ? (
                    <View style={{ backgroundColor: `${tokens.surface}EE`, paddingVertical: 6, paddingHorizontal: SPACING.md }}>
                      <Text style={{ color: tokens.textSecondary, fontSize: FONTS.sizes.xs, textAlign: 'center' }}>
                        {(block as any).caption}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={{ aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundElevated, gap: 6 }}>
                  <Ionicons name="image-outline" size={40} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Image not selected</Text>
                </View>
              )}
            </View>
            <TextInput
              value={(block as any).caption ?? ''}
              onChangeText={v => onUpdateBlock(block.id, { caption: v || undefined } as any)}
              placeholder="Add a caption…"
              placeholderTextColor={COLORS.textMuted}
              style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginTop: 6, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border, textAlign: 'center' }}
            />
          </View>
        );

      // ── STAT ───────────────────────────────────────────────────────────────
      case 'stat':
        return (
          <View style={{
            backgroundColor: tokens.surface,
            borderRadius:    RADIUS.xl,
            overflow:        'hidden',
            borderWidth:     1,
            borderTopWidth:  4,
            borderTopColor:  col,
            borderColor:     `${col}30`,
            shadowColor:     col,
            shadowOffset:    { width: 0, height: 3 },
            shadowOpacity:   0.2,
            shadowRadius:    8,
            elevation:       3,
          }}>
            <View style={{ padding: SPACING.md, alignItems: 'center', gap: 6 }}>
              <TextInput
                value={block.value}
                onChangeText={v => onUpdateBlock(block.id, { value: v } as any)}
                placeholder="87%"
                placeholderTextColor={COLORS.textMuted}
                style={{ color: col, fontSize: 40, fontWeight: '900', textAlign: 'center', borderBottomWidth: 1.5, borderBottomColor: `${col}40`, minWidth: 90, paddingVertical: 2 }}
              />
              <TextInput
                value={block.label}
                onChangeText={v => onUpdateBlock(block.id, { label: v } as any)}
                placeholder="Metric label"
                placeholderTextColor={COLORS.textMuted}
                style={{ color: tokens.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600', textAlign: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border, minWidth: 150, paddingVertical: 2 }}
              />
              {block.unit !== undefined && (
                <TextInput
                  value={block.unit}
                  onChangeText={v => onUpdateBlock(block.id, { unit: v } as any)}
                  placeholder="unit / context"
                  placeholderTextColor={COLORS.textMuted}
                  style={{ color: tokens.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', minWidth: 120, paddingVertical: 2 }}
                />
              )}
            </View>
            <View style={{ backgroundColor: `${col}10`, paddingVertical: 5, paddingHorizontal: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="sync-outline" size={10} color={col} />
              <Text style={{ color: col, fontSize: 9, opacity: 0.8 }}>Edits reflected in PPTX/PDF export</Text>
            </View>
          </View>
        );

      // ── CHART ──────────────────────────────────────────────────────────────
      case 'chart': {
        const cd    = block.chart;
        const CCOLS = [accentColor, '#43E97B', '#FFA726', '#FF6584', '#29B6F6', '#AB47BC'];
        const hasBars = cd.datasets?.[0]?.data && cd.labels;
        const maxV    = hasBars ? Math.max(...cd.datasets![0].data, 1) : 1;
        return (
          <View style={{ backgroundColor: tokens.surface, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${accentColor}30`, gap: SPACING.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <LinearGradient colors={[`${accentColor}BB`, accentColor]} style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ionicons name={cd.type === 'bar' ? 'bar-chart' : cd.type === 'pie' ? 'pie-chart' : 'trending-up'} size={19} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={{ color: tokens.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{cd.title}</Text>
                {cd.subtitle && <Text style={{ color: tokens.textMuted, fontSize: FONTS.sizes.xs }}>{cd.subtitle}</Text>}
              </View>
              <View style={{ backgroundColor: `${accentColor}18`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: accentColor, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }}>{cd.type}</Text>
              </View>
            </View>
            {hasBars && (
              <View style={{ height: 80, paddingTop: 4 }}>
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end', flex: 1 }}>
                  {cd.labels!.slice(0, 8).map((label, i) => {
                    const val = cd.datasets![0].data[i] ?? 0;
                    const pct = val / maxV;
                    const bc  = CCOLS[i % CCOLS.length];
                    return (
                      <View key={i} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                        <Text style={{ color: tokens.textMuted, fontSize: 8, fontWeight: '700' }}>
                          {typeof val === 'number' && val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}
                        </Text>
                        <View style={{ width: '100%', height: Math.max(50 * pct, 4), backgroundColor: `${bc}BB`, borderRadius: 3, borderTopWidth: 2, borderTopColor: bc }} />
                        <Text style={{ color: tokens.textMuted, fontSize: 7, textAlign: 'center' }} numberOfLines={2}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
            <View style={{ backgroundColor: `${COLORS.success}12`, borderRadius: RADIUS.sm, padding: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="checkmark-circle-outline" size={12} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontSize: 9 }}>Full chart renders in PPTX/PDF export</Text>
            </View>
          </View>
        );
      }

      // ── QUOTE BLOCK ────────────────────────────────────────────────────────
      case 'quote_block':
        return (
          <View style={{ backgroundColor: `${accentColor}08`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${accentColor}25`, borderLeftWidth: 5, borderLeftColor: accentColor, gap: SPACING.sm }}>
            <Text style={{ color: accentColor, fontSize: 44, lineHeight: 34, fontWeight: '900', opacity: 0.25, marginBottom: -8 }}>"</Text>
            <TextInput
              value={block.text}
              onChangeText={v => onUpdateBlock(block.id, { text: v } as any)}
              placeholder="Enter your quote…"
              placeholderTextColor={COLORS.textMuted}
              multiline
              style={{ color: tokens.textPrimary, fontSize: FONTS.sizes.base, fontStyle: 'italic', lineHeight: 24, textAlignVertical: 'top', borderBottomWidth: 1, borderBottomColor: `${accentColor}30`, paddingBottom: SPACING.sm }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 20, height: 1.5, backgroundColor: accentColor, opacity: 0.6 }} />
              <TextInput
                value={block.attribution ?? ''}
                onChangeText={v => onUpdateBlock(block.id, { attribution: v || undefined } as any)}
                placeholder="Attribution (optional)"
                placeholderTextColor={COLORS.textMuted}
                style={{ flex: 1, color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '600' }}
              />
            </View>
          </View>
        );

      // ── DIVIDER ────────────────────────────────────────────────────────────
      case 'divider': {
        const dc = block.color ?? accentColor;
        return (
          <View style={{ paddingVertical: SPACING.md, gap: 6 }}>
            {block.style === 'solid'   && <View style={{ height: 2.5, backgroundColor: dc, borderRadius: 1.5 }} />}
            {block.style === 'dashed'  && <View style={{ height: 0, borderTopWidth: 2, borderTopColor: dc, borderStyle: 'dashed' }} />}
            {block.style === 'diamond' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {[0,1,2,3,4,5].map(i => (
                  <View key={i} style={{ width: 9, height: 9, backgroundColor: i % 3 === 1 ? dc : `${dc}55`, transform: [{ rotate: '45deg' }] }} />
                ))}
              </View>
            )}
            <Text style={{ color: COLORS.textMuted, fontSize: 9, textAlign: 'center', fontWeight: '600' }}>
              {block.style} divider
            </Text>
          </View>
        );
      }

      // ── SPACER ─────────────────────────────────────────────────────────────
      case 'spacer': {
        const dpH = block.height ?? 24;
        return (
          <View style={{ height: Math.max(dpH * 0.5, 20), alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: '70%', borderTopWidth: 1, borderTopColor: COLORS.border, borderStyle: 'dashed' }} />
            </View>
            <View style={{ backgroundColor: COLORS.backgroundCard, paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600' }}>↕ {dpH}dp spacer</Text>
            </View>
          </View>
        );
      }

      // ── ICON ───────────────────────────────────────────────────────────────
      case 'icon': {
        const sz = block.size ?? 48;
        return (
          <View style={{ alignItems: 'center', paddingVertical: SPACING.md, gap: SPACING.sm }}>
            <View style={{ width: sz + 28, height: sz + 28, borderRadius: (sz + 28) / 2, backgroundColor: `${col}15`, borderWidth: 2, borderColor: `${col}35`, alignItems: 'center', justifyContent: 'center', shadowColor: col, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 }}>
              <Ionicons name={block.iconName as any} size={sz} color={col} />
            </View>
            <TextInput
              value={block.label ?? ''}
              onChangeText={v => onUpdateBlock(block.id, { label: v || undefined } as any)}
              placeholder="Icon label (optional)"
              placeholderTextColor={COLORS.textMuted}
              style={{ color: tokens.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', textAlign: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 4, minWidth: 130 }}
            />
          </View>
        );
      }

      default: return null;
    }
  };

  return (
    <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' }}>
      {/* Colored header bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.md, paddingVertical: 9, backgroundColor: `${col}12`, borderBottomWidth: 1, borderBottomColor: `${col}20` }}>
        <Ionicons name={blockIcon as any} size={13} color={col} />
        <Text style={{ color: col, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>
          {block.type.replace('_', ' ')} block
        </Text>
        <TouchableOpacity
          onPress={() => Alert.alert('Delete Block', `Remove this ${block.type.replace('_', ' ')} block from this slide?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDelete(block.id) }])}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${COLORS.error}18`, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="trash-outline" size={13} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      {/* Block content */}
      <View style={{ padding: SPACING.md }}>
        {renderContent()}
      </View>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlideEditorCanvasProps {
  slide:               EditableSlide;
  tokens:              PresentationThemeTokens;
  fontFamily?:         string;
  getFormatting:       (field: EditableFieldKey) => FieldFormatting;
  editingText:         string;
  selectedField:       EditableFieldKey | null;
  onFieldTap:          (field: EditableFieldKey) => void;
  onEditingTextChange: (text: string) => void;
  onCommitField:       (field: EditableFieldKey, value: string) => void;
  onUpdateBullet:      (i: number, v: string) => void;
  onAddBullet:         () => void;
  onRemoveBullet:      (i: number) => void;
  onDeleteBlock:       (blockId: string) => void;
  onUpdateBlock:       (blockId: string, patch: Partial<AdditionalBlock>) => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SlideEditorCanvas({
  slide, tokens, fontFamily, getFormatting, editingText, selectedField,
  onFieldTap, onEditingTextChange, onCommitField,
  onUpdateBullet, onAddBullet, onRemoveBullet,
  onDeleteBlock, onUpdateBlock,
}: SlideEditorCanvasProps) {
  const accentColor    = slide.accentColor ?? tokens.primary;
  const editableFields = LAYOUT_FIELDS[slide.layout] ?? ['title'];
  const hasBullets     = ['bullets', 'agenda', 'predictions', 'references'].includes(slide.layout);
  const blocks         = slide.editorData?.additionalBlocks ?? [];

  // FIX 1: Read overrides directly from editorData
  const bgOverride   = slide.editorData?.backgroundColor;
  const spacingLevel = slide.editorData?.spacing ?? 'default';
  const spacingLabel = SPACING_LABELS[spacingLevel];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 100 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* ──────────────────────────────────────────────────────────────────────
          SLIDE PREVIEW — FIX 1/2/3/4 all applied here
      ────────────────────────────────────────────────────────────────────── */}
      <View style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.md }}>

        {/* FIX 1: Outer wrapper backgroundColor ensures bg override is always visible
            SlideCard also reads (slide as any).editorData.backgroundColor internally.
            Having it on the wrapper handles edge cases where SlideCard's section/quote
            special backgrounds might override the editorData bg. */}
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
          backgroundColor: bgOverride ?? tokens.background,  // FIX 1
        }}>
          {/* FIX 2: noTruncate=true | FIX 3: spacing read from slide.editorData | FIX 4: fontFamily */}
          <SlideCard
            slide={slide}
            tokens={tokens}
            scale={CANVAS_SC}
            fontFamily={fontFamily}  // FIX 4
            noTruncate               // FIX 2
          />
        </View>

        {/* Active-override status chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
          {bgOverride && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: bgOverride }} />
              <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>BG: {bgOverride}</Text>
            </View>
          )}
          {spacingLabel ? (
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>{spacingLabel} spacing</Text>
            </View>
          ) : null}
          {fontFamily && fontFamily !== 'system' && (
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>Font: {fontFamily}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Editable field cards ─────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md, gap: SPACING.sm }}>

        {/* Section divider */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
          <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>✏ Fields</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
        </View>

        {editableFields.map(field => {
          const rawValue = (slide as any)[field] as string | undefined;
          const fmt      = getFormatting(field);
          const isActive = selectedField === field;

          return (
            <Pressable
              key={field}
              onPress={() => onFieldTap(field)}
              style={{
                backgroundColor: isActive ? `${accentColor}12` : COLORS.backgroundCard,
                borderRadius:    RADIUS.xl,
                padding:         SPACING.md,
                borderWidth:     isActive ? 2 : 1,
                borderColor:     isActive ? accentColor : COLORS.border,
                gap:             6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="pencil-outline" size={12} color={isActive ? accentColor : COLORS.textMuted} />
                <Text style={{ color: isActive ? accentColor : COLORS.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {FIELD_LABELS[field] ?? field}
                </Text>
                {!rawValue && (
                  <View style={{ backgroundColor: `${COLORS.warning}20`, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ color: COLORS.warning, fontSize: 8, fontWeight: '700' }}>EMPTY</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 4, marginLeft: 'auto' as any }}>
                  {fmt.bold      && <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '900' }}>B</Text>}
                  {fmt.italic    && <Text style={{ color: COLORS.primary, fontSize: 9, fontStyle: 'italic' }}>I</Text>}
                  {fmt.color     && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fmt.color }} />}
                  {fmt.alignment && fmt.alignment !== 'left' && (
                    <Ionicons name={fmt.alignment === 'center' ? 'menu' : 'arrow-forward'} size={10} color={COLORS.primary} />
                  )}
                </View>
              </View>

              {/* FIX 2: Full text displayed — no numberOfLines truncation */}
              <Text style={{
                color:      fmt.color ?? (rawValue ? COLORS.textSecondary : COLORS.textMuted),
                fontSize:   FONTS.sizes.sm,
                lineHeight: 20,
                fontWeight: (fmt.bold   ? '700'   : '400') as any,
                fontStyle:  (fmt.italic ? 'italic' : (rawValue ? 'normal' : 'italic')) as any,
                textAlign:  fmt.alignment ?? 'left',
              }}>
                {rawValue || `Tap to add ${FIELD_LABELS[field] ?? field}…`}
              </Text>
            </Pressable>
          );
        })}

        {/* Bullets */}
        {hasBullets && (
          <BulletEditor
            bullets={slide.bullets ?? []}
            accentColor={accentColor}
            onUpdate={onUpdateBullet}
            onAdd={onAddBullet}
            onRemove={onRemoveBullet}
          />
        )}

        {/* Stats quick view */}
        {slide.layout === 'stats' && (slide.stats?.length ?? 0) > 0 && (
          <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${accentColor}25`, gap: SPACING.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="stats-chart-outline" size={14} color={accentColor} />
              <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                Statistics ({slide.stats!.length})
              </Text>
            </View>
            {slide.stats!.map((stat, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, padding: SPACING.sm }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stat.color ?? accentColor, flexShrink: 0 }} />
                <Text style={{ color: stat.color ?? accentColor, fontSize: 20, fontWeight: '900', minWidth: 60 }}>{stat.value}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>{stat.label}</Text>
                </View>
              </View>
            ))}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, opacity: 0.7 }}>
              Add more stats via Blocks tab → Stat
            </Text>
          </View>
        )}

        {/* Speaker notes */}
        {slide.speakerNotes ? (
          <Pressable
            onPress={() => onFieldTap('speakerNotes')}
            style={{ backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.info}25` }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="reader-outline" size={13} color={COLORS.info} />
              <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Speaker Notes</Text>
              <Ionicons name="pencil-outline" size={11} color={COLORS.info} />
            </View>
            {/* FIX 2: Full notes — no numberOfLines */}
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 17, fontStyle: 'italic' }}>
              {slide.speakerNotes}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onFieldTap('speakerNotes')}
            style={{ backgroundColor: `${COLORS.info}06`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.info}18`, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Ionicons name="reader-outline" size={15} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic', flex: 1 }}>
              No speaker notes — tap to write, or use AI ✦ → Notes tab
            </Text>
          </Pressable>
        )}

        {/* FIX 5: Additional Blocks — styled in-slide cards */}
        {blocks.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.xs }}>
              <View style={{ flex: 1, height: 1.5, backgroundColor: `${accentColor}30` }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${accentColor}12`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Ionicons name="layers-outline" size={11} color={accentColor} />
                <Text style={{ color: accentColor, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {blocks.length} block{blocks.length !== 1 ? 's' : ''} added
                </Text>
              </View>
              <View style={{ flex: 1, height: 1.5, backgroundColor: `${accentColor}30` }} />
            </View>

            <View style={{ gap: SPACING.md }}>
              {blocks.map(block => (
                <InSlideBlockCard
                  key={block.id}
                  block={block}
                  accentColor={accentColor}
                  tokens={tokens}
                  onDelete={onDeleteBlock}
                  onUpdateBlock={onUpdateBlock}
                />
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${accentColor}06`, borderRadius: RADIUS.lg, padding: SPACING.sm }}>
              <Ionicons name="information-circle-outline" size={12} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: 9, flex: 1, lineHeight: 13 }}>
                Blocks export below the main slide content in PPTX/PDF.
              </Text>
            </View>
          </>
        )}

        {blocks.length === 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: SPACING.sm, opacity: 0.45 }}>
            <Ionicons name="add-circle-outline" size={13} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>
              Tap Blocks tab to insert images, stats, charts, quotes, icons…
            </Text>
          </View>
        )}
      </View>

      {/* Text edit modal */}
      <TextEditModal
        visible={!!selectedField}
        field={selectedField}
        value={editingText}
        formatting={selectedField ? getFormatting(selectedField) : {}}
        accentColor={accentColor}
        onChange={onEditingTextChange}
        onCommit={onCommitField}
        onClose={() => selectedField && onCommitField(selectedField, editingText)}
      />
    </ScrollView>
  );
}