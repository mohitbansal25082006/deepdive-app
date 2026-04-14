// src/components/editor/SlideEditorCanvas.tsx
// Part 41.9 — Added StatEditModal + interactive editable stats section.
//             New props: onUpdateStat, onDeleteStat, onAddStatToSlide.
//             All Part 30 logic (JoystickPositionControl, OnlineImageSearchPanel,
//             IconifyIconPicker, block inserter) unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, Dimensions, KeyboardAvoidingView,
  Platform, Image, TouchableOpacity,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import * as ImagePicker      from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SlideCard }                    from '../research/SlideCard';
import { TOOLBAR_ACCESSORY_ID }         from './FormattingToolbar';
import { JoystickPositionControl }      from './JoystickPositionControl';
import { OnlineImageSearchPanel }       from './OnlineImageSearchPanel';
import { IconifyIconPicker }            from './IconifyIconPicker';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import {
  DIVIDER_STYLES,
  DEFAULT_ICON_SIZE,
  DEFAULT_SPACER_HEIGHT,
  THEME_ACCENT_COLORS,
} from '../../constants/editor';
import type {
  EditableSlide, EditableFieldKey, AdditionalBlock, FieldFormatting,
  ImageBlock, ChartBlock, StatBlock, QuoteBlock,
  DividerBlock, SpacerBlock, IconBlock, DividerStyle,
  InlineBlockPosition,
} from '../../types/editor';
import type { PresentationThemeTokens, InfographicData } from '../../types';
import type { StatItem } from '../../hooks/useSlideEditor';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W  = Dimensions.get('window').width;
const SCREEN_H  = Dimensions.get('window').height;
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

function uid() {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

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
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }} onPress={done}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable onPress={e => e.stopPropagation()} style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: insets.bottom + SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: `${accentColor}20`, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}>
                <Ionicons name="pencil-outline" size={15} color={accentColor} />
              </View>
              <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>Edit {FIELD_LABELS[field] ?? field}</Text>
              <Pressable onPress={done} style={{ backgroundColor: accentColor, borderRadius: RADIUS.full, paddingHorizontal: 16, paddingVertical: 7 }}>
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>Done</Text>
              </Pressable>
            </View>
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, borderWidth: 1.5, borderColor: `${accentColor}55`, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}>
              <TextInput
                value={value}
                onChangeText={onChange}
                multiline={isMulti}
                numberOfLines={isMulti ? 6 : 2}
                autoFocus
                inputAccessoryViewID={Platform.OS === 'ios' ? TOOLBAR_ACCESSORY_ID : undefined}
                placeholder={`Enter ${FIELD_LABELS[field] ?? field}…`}
                placeholderTextColor={COLORS.textMuted}
                style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, lineHeight: 24, minHeight: isMulti ? 120 : 44, textAlignVertical: isMulti ? 'top' : 'center', fontWeight: formatting.bold ? '700' : '400', fontStyle: formatting.italic ? 'italic' : 'normal', textAlign: formatting.alignment ?? 'left' }}
                returnKeyType={isMulti ? 'default' : 'done'}
                onSubmitEditing={isMulti ? undefined : done}
                blurOnSubmit={!isMulti}
              />
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
    <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${accentColor}25`, gap: SPACING.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Ionicons name="list-outline" size={14} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Bullet Points ({bullets.length})</Text>
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
            style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 20, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingTop: 8, paddingBottom: 8, borderWidth: 1, borderColor: COLORS.border, textAlignVertical: 'top' }}
          />
          <Pressable onPress={() => onRemove(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 8 }}>
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </Pressable>
        </View>
      ))}
      <TouchableOpacity onPress={onAdd} activeOpacity={0.6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4 }}>
        <Ionicons name="add-circle-outline" size={20} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Add bullet point</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Part 41.9: Stat Edit Modal ───────────────────────────────────────────────

function StatEditModal({
  visible,
  stat,
  title,
  accentColor,
  onSave,
  onClose,
}: {
  visible:     boolean;
  stat:        StatItem | null;
  title:       string;
  accentColor: string;
  onSave:      (updated: StatItem) => void;
  onClose:     () => void;
}) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(accentColor);

  // Sync from incoming stat when modal opens
  React.useEffect(() => {
    if (visible && stat) {
      setValue(stat.value);
      setLabel(stat.label);
      setColor(stat.color ?? accentColor);
    }
  }, [visible, stat]);

  const handleSave = useCallback(() => {
    if (!value.trim()) { Alert.alert('Value required', 'Enter a stat value.'); return; }
    if (!label.trim()) { Alert.alert('Label required', 'Enter a stat label.'); return; }
    onSave({ value: value.trim(), label: label.trim(), color });
    onClose();
  }, [value, label, color, onSave, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable onPress={e => e.stopPropagation()} style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: insets.bottom + SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.md }}>

            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center' }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <LinearGradient colors={[color, `${color}BB`]} style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="stats-chart-outline" size={17} color="#FFF" />
              </LinearGradient>
              <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </Pressable>
            </View>

            {/* Live preview */}
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${color}35`, alignItems: 'center', borderTopWidth: 3, borderTopColor: color }}>
              <Text style={{ color: color, fontSize: 32, fontWeight: '900', lineHeight: 38 }}>{value || '—'}</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginTop: 4, textAlign: 'center' }}>{label || 'Stat label'}</Text>
            </View>

            {/* Value input */}
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: `${color}40`, paddingHorizontal: SPACING.md }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Value *</Text>
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder="e.g. 87%, $4.2B, 3x"
                placeholderTextColor={COLORS.textMuted}
                style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '900', paddingVertical: 8 }}
                autoFocus
              />
            </View>

            {/* Label input */}
            <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Label *</Text>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. Market Growth, Users, Revenue"
                placeholderTextColor={COLORS.textMuted}
                style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, paddingVertical: 8 }}
              />
            </View>

            {/* Color picker */}
            <View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.sm }}>Accent Color</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {THEME_ACCENT_COLORS.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: color === c ? 3 : 1.5, borderColor: color === c ? '#FFF' : `${c}50`, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {color === c && <Ionicons name="checkmark" size={15} color="#FFF" />}
                  </Pressable>
                ))}
                {/* Additional standard colors */}
                {['#43E97B', '#FFA726', '#FF6584', '#29B6F6', '#FF4757', '#FFD700'].map(c => (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: color === c ? 3 : 1.5, borderColor: color === c ? '#FFF' : `${c}50`, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {color === c && <Ionicons name="checkmark" size={15} color="#FFF" />}
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Save button */}
            <Pressable onPress={handleSave}>
              <LinearGradient colors={[color, `${color}CC`]} style={{ borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Save Stat</Text>
              </LinearGradient>
            </Pressable>

          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ─── Part 41.9: Interactive Stats Section ─────────────────────────────────────

function EditableStatsSection({
  stats,
  accentColor,
  onUpdate,
  onDelete,
  onAdd,
}: {
  stats:       Array<{ value: string; label: string; color?: string }>;
  accentColor: string;
  onUpdate:    (index: number, patch: Partial<StatItem>) => void;
  onDelete:    (index: number) => void;
  onAdd:       (stat: StatItem) => void;
}) {
  const [editingIndex, setEditingIndex]   = useState<number | null>(null);
  const [showAddModal, setShowAddModal]   = useState(false);

  const editingStat = editingIndex !== null ? stats[editingIndex] ?? null : null;

  return (
    <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${accentColor}25`, gap: SPACING.sm }}>

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="stats-chart-outline" size={14} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>
          Statistics ({stats.length})
        </Text>
        <Pressable
          onPress={() => setShowAddModal(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${accentColor}18`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: `${accentColor}35` }}
        >
          <Ionicons name="add" size={13} color={accentColor} />
          <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Add</Text>
        </Pressable>
      </View>

      {/* Stat rows */}
      {stats.map((stat, i) => {
        const statColor = stat.color ?? accentColor;
        return (
          <View
            key={i}
            style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, borderLeftColor: statColor }}
          >
            {/* Color dot */}
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: statColor, flexShrink: 0 }} />

            {/* Value + Label */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: statColor, fontSize: FONTS.sizes.lg, fontWeight: '900', lineHeight: 24 }}>{stat.value}</Text>
              <Text numberOfLines={1} style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600', marginTop: 1 }}>{stat.label}</Text>
            </View>

            {/* Edit button */}
            <TouchableOpacity
              onPress={() => setEditingIndex(i)}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ width: 30, height: 30, borderRadius: RADIUS.md, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.primary}30` }}
            >
              <Ionicons name="pencil-outline" size={14} color={COLORS.primary} />
            </TouchableOpacity>

            {/* Delete button */}
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  'Delete Stat',
                  `Remove "${stat.value} — ${stat.label}"?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => onDelete(i) },
                  ]
                )
              }
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ width: 30, height: 30, borderRadius: RADIUS.md, backgroundColor: `${COLORS.error}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.error}30` }}
            >
              <Ionicons name="trash-outline" size={14} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        );
      })}

      {/* Empty state */}
      {stats.length === 0 && (
        <Pressable
          onPress={() => setShowAddModal(true)}
          style={{ paddingVertical: SPACING.md, alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: `${accentColor}30`, borderRadius: RADIUS.lg, borderStyle: 'dashed' }}
        >
          <Ionicons name="add-circle-outline" size={22} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' }}>No stats yet — tap Add to create one</Text>
        </Pressable>
      )}

      {/* Hint */}
      {stats.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <Ionicons name="information-circle-outline" size={12} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: 9, flex: 1 }}>Tap ✏ to edit value, label or color · Tap 🗑 to remove</Text>
        </View>
      )}

      {/* Edit existing stat modal */}
      <StatEditModal
        visible={editingIndex !== null}
        stat={editingStat}
        title={`Edit Stat ${editingIndex !== null ? editingIndex + 1 : ''}`}
        accentColor={accentColor}
        onSave={updated => {
          if (editingIndex !== null) onUpdate(editingIndex, updated);
          setEditingIndex(null);
        }}
        onClose={() => setEditingIndex(null)}
      />

      {/* Add new stat modal */}
      <StatEditModal
        visible={showAddModal}
        stat={{ value: '', label: '', color: accentColor }}
        title="Add New Stat"
        accentColor={accentColor}
        onSave={stat => { onAdd(stat); setShowAddModal(false); }}
        onClose={() => setShowAddModal(false)}
      />
    </View>
  );
}

// ─── Block type tabs metadata ─────────────────────────────────────────────────

type BlockTabId = 'image' | 'stat' | 'chart' | 'quote_block' | 'divider' | 'spacer' | 'icon';

interface BlockTabMeta {
  id:    BlockTabId;
  label: string;
  icon:  string;
  color: string;
}

const BLOCK_TABS: BlockTabMeta[] = [
  { id: 'image',       label: 'Image',   icon: 'image-outline',       color: '#4FACFE' },
  { id: 'stat',        label: 'Stat',    icon: 'stats-chart-outline', color: '#6C63FF' },
  { id: 'chart',       label: 'Chart',   icon: 'bar-chart-outline',   color: '#8B5CF6' },
  { id: 'quote_block', label: 'Quote',   icon: 'chatbubble-outline',  color: '#FF6584' },
  { id: 'divider',     label: 'Divider', icon: 'remove-outline',      color: '#43E97B' },
  { id: 'spacer',      label: 'Spacer',  icon: 'expand-outline',      color: '#FFA726' },
  { id: 'icon',        label: 'Icon',    icon: 'shapes-outline',      color: '#29B6F6' },
];

// ─── ImagePanel ───────────────────────────────────────────────────────────────

function ImagePanel({
  position,
  slideTitle,
  slideLayout,
  onInsert,
}: {
  position:    InlineBlockPosition;
  slideTitle?: string;
  slideLayout?: string;
  onInsert:    (b: ImageBlock) => void;
}) {
  const [showOnlineSearch, setShowOnlineSearch] = useState(false);

  const handlePickLocal = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      onInsert({ type: 'image', id: uid(), uri: asset.uri, caption: '', aspectRatio: asset.width && asset.height ? asset.width / asset.height : 16 / 9, position });
    }
  }, [position, onInsert]);

  return (
    <View style={{ gap: SPACING.md }}>
      <View style={{ flexDirection: 'row', backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: 3, borderWidth: 1, borderColor: COLORS.border }}>
        {[
          { id: false, label: '📱 From Device', desc: 'Pick from your photo library' },
          { id: true,  label: '🌐 Search Online', desc: 'Search via Google Images' },
        ].map(opt => (
          <Pressable
            key={String(opt.id)}
            onPress={() => setShowOnlineSearch(opt.id)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 9, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.lg, backgroundColor: showOnlineSearch === opt.id ? COLORS.primary : 'transparent' }}
          >
            <Text style={{ color: showOnlineSearch === opt.id ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{opt.label}</Text>
            <Text style={{ color: showOnlineSearch === opt.id ? 'rgba(255,255,255,0.7)' : COLORS.textMuted, fontSize: 9, marginTop: 2 }}>{opt.desc}</Text>
          </Pressable>
        ))}
      </View>

      {!showOnlineSearch && (
        <Pressable onPress={handlePickLocal}>
          <LinearGradient colors={['#4FACFE', '#00F2FE']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm }}>
            <Ionicons name="image" size={36} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Choose from Photos</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.xs }}>Pick an image from your device library</Text>
          </LinearGradient>
        </Pressable>
      )}

      {showOnlineSearch && (
        <View style={{ backgroundColor: `${COLORS.info}08`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.info}20` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm }}>
            <Ionicons name="information-circle-outline" size={14} color={COLORS.info} />
            <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, flex: 1 }}>
              Tapping "Search" below will open the full image search screen.
            </Text>
          </View>
          <Pressable onPress={() => {
            onInsert({ type: 'image', id: '__OPEN_ONLINE_SEARCH__', uri: '', position } as any);
          }}>
            <LinearGradient colors={['#4FACFE', '#00F2FE']} style={{ borderRadius: RADIUS.full, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="search" size={18} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Open Image Search</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── StatPanel (for AdditionalBlock stat overlay — separate from slide.stats) ──

function StatPanel({ position, onInsert, infographicData }: { position: InlineBlockPosition; onInsert: (b: StatBlock) => void; infographicData?: InfographicData | null }) {
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [unit,  setUnit]  = useState('');
  const [color, setColor] = useState(COLORS.primary);

  const handleAdd = useCallback(() => {
    if (!value.trim() || !label.trim()) { Alert.alert('Missing fields', 'Fill in value and label.'); return; }
    onInsert({ type: 'stat', id: uid(), value: value.trim(), label: label.trim(), unit: unit.trim() || undefined, color, position });
    setValue(''); setLabel(''); setUnit('');
  }, [value, label, unit, color, position, onInsert]);

  const existingStats = infographicData?.stats ?? [];

  return (
    <View style={{ gap: SPACING.md }}>
      {existingStats.length > 0 && (
        <>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>From Your Report</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
            {existingStats.slice(0, 8).map(stat => (
              <Pressable key={stat.id} onPress={() => onInsert({ type: 'stat', id: uid(), value: stat.value, label: stat.label, color: stat.color ?? COLORS.primary, position })} style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, width: 110, alignItems: 'center' }}>
                <Text style={{ color: stat.color ?? COLORS.primary, fontSize: FONTS.sizes.lg, fontWeight: '900' }}>{stat.value}</Text>
                <Text numberOfLines={2} style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: 4 }}>{stat.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ height: 1, backgroundColor: COLORS.border }} />
        </>
      )}
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Custom Overlay Stat</Text>
      {[
        { label: 'Value *', value, set: setValue, placeholder: 'e.g. 87% or $4.2B' },
        { label: 'Label *', value: label, set: setLabel, placeholder: 'e.g. Market Growth' },
        { label: 'Unit (optional)', value: unit, set: setUnit, placeholder: 'e.g. per year' },
      ].map(field => (
        <View key={field.label} style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>{field.label}</Text>
          <TextInput value={field.value} onChangeText={field.set} placeholder={field.placeholder} placeholderTextColor={COLORS.textMuted} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, paddingVertical: 8 }} />
        </View>
      ))}
      <View>
        <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600', marginBottom: 6 }}>ACCENT COLOR</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {THEME_ACCENT_COLORS.map(c => (
            <Pressable key={c} onPress={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: color === c ? 2.5 : 0, borderColor: '#FFF' }}>
              {color === c && <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={13} color="#FFF" /></View>}
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable onPress={handleAdd}>
        <LinearGradient colors={['#6C63FF', '#8B5CF6']} style={{ borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add Stat Overlay</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── ChartPanel ───────────────────────────────────────────────────────────────

function ChartPanel({ position, onInsert, infographicData }: { position: InlineBlockPosition; onInsert: (b: ChartBlock) => void; infographicData?: InfographicData | null }) {
  const charts = infographicData?.charts ?? [];
  if (charts.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
        <Ionicons name="bar-chart-outline" size={40} color={COLORS.textMuted} />
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.md, textAlign: 'center' }}>No charts found in this report's research data.{'\n'}Charts are generated automatically for reports with statistics.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: SPACING.sm }}>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.xs }}>Available Charts ({charts.length})</Text>
      {charts.slice(0, 6).map(chart => (
        <Pressable key={chart.id} onPress={() => onInsert({ type: 'chart', id: uid(), chart, position })} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${COLORS.primary}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ionicons name={chart.type === 'bar' ? 'bar-chart-outline' : chart.type === 'pie' ? 'pie-chart-outline' : 'trending-up-outline'} size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{chart.title}</Text>
            {chart.subtitle && <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{chart.subtitle}</Text>}
            <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>{chart.type} chart</Text>
            </View>
          </View>
          <Ionicons name="add-circle-outline" size={22} color={COLORS.primary} />
        </Pressable>
      ))}
    </View>
  );
}

// ─── QuotePanel ───────────────────────────────────────────────────────────────

function QuotePanel({ position, onInsert }: { position: InlineBlockPosition; onInsert: (b: QuoteBlock) => void }) {
  const [text,   setText]   = useState('');
  const [attrib, setAttrib] = useState('');
  const handleAdd = useCallback(() => {
    if (!text.trim()) { Alert.alert('Missing quote', 'Enter the quote text.'); return; }
    onInsert({ type: 'quote_block', id: uid(), text: text.trim(), attribution: attrib.trim() || undefined, position });
    setText(''); setAttrib('');
  }, [text, attrib, position, onInsert]);
  return (
    <View style={{ gap: SPACING.md }}>
      <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>Quote Text *</Text>
        <TextInput value={text} onChangeText={setText} placeholder="Enter the pull-quote text…" placeholderTextColor={COLORS.textMuted} multiline numberOfLines={3} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 8, minHeight: 72, textAlignVertical: 'top', fontStyle: text ? 'italic' : 'normal' }} />
      </View>
      <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>Attribution (optional)</Text>
        <TextInput value={attrib} onChangeText={setAttrib} placeholder="Name, Organization, Year" placeholderTextColor={COLORS.textMuted} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 8 }} />
      </View>
      <Pressable onPress={handleAdd}>
        <LinearGradient colors={['#FF6584', '#F093FB']} style={{ borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="chatbubble" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add Quote Block</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── DividerPanel ─────────────────────────────────────────────────────────────

function DividerPanel({ position, onInsert, accentColor }: { position: InlineBlockPosition; onInsert: (b: DividerBlock) => void; accentColor: string }) {
  const [selected, setSelected] = useState<DividerStyle>('solid');
  return (
    <View style={{ gap: SPACING.md }}>
      {DIVIDER_STYLES.map(style => (
        <Pressable key={style.id} onPress={() => setSelected(style.id)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: selected === style.id ? `${COLORS.primary}12` : COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1.5, borderColor: selected === style.id ? COLORS.primary : COLORS.border, gap: SPACING.md }}>
          <Ionicons name={style.icon as any} size={22} color={selected === style.id ? COLORS.primary : COLORS.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: selected === style.id ? COLORS.textPrimary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{style.label}</Text>
            <View style={{ marginTop: 6, height: 4, width: '80%', justifyContent: 'center' }}>
              {style.id === 'solid'   && <View style={{ height: 1.5, backgroundColor: accentColor }} />}
              {style.id === 'dashed'  && <View style={{ height: 1.5, borderWidth: 1, borderColor: accentColor, borderStyle: 'dashed' }} />}
              {style.id === 'diamond' && <View style={{ flexDirection: 'row', gap: 4 }}>{[0,1,2,3,4].map(i => <View key={i} style={{ width: 5, height: 5, backgroundColor: accentColor, transform: [{ rotate: '45deg' }] }} />)}</View>}
            </View>
          </View>
          {selected === style.id && <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={12} color="#FFF" /></View>}
        </Pressable>
      ))}
      <Pressable onPress={() => onInsert({ type: 'divider', id: uid(), style: selected, color: accentColor, position })}>
        <LinearGradient colors={['#43E97B', '#38F9D7']} style={{ borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="remove" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add {DIVIDER_STYLES.find(s => s.id === selected)?.label} Divider</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── SpacerPanel ──────────────────────────────────────────────────────────────

function SpacerPanel({ position, onInsert }: { position: InlineBlockPosition; onInsert: (b: SpacerBlock) => void }) {
  const options = [12, 24, 48, 72];
  const [selected, setSelected] = useState(24);
  return (
    <View style={{ gap: SPACING.md }}>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Spacer Height</Text>
      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
        {options.map(h => (
          <Pressable key={h} onPress={() => setSelected(h)} style={{ flex: 1, alignItems: 'center', paddingVertical: SPACING.md, backgroundColor: selected === h ? `${COLORS.primary}18` : COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: selected === h ? COLORS.primary : COLORS.border, gap: 4 }}>
            <Text style={{ color: selected === h ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{h}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600' }}>dp</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => onInsert({ type: 'spacer', id: uid(), height: selected, position })}>
        <LinearGradient colors={['#FFA726', '#FF7043']} style={{ borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="expand" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add {selected}dp Spacer</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── OverlayBlockCard ─────────────────────────────────────────────────────────

function OverlayBlockCard({
  block,
  accentColor,
  onDelete,
  onUpdateBlock,
}: {
  block:         AdditionalBlock;
  accentColor:   string;
  onDelete:      (id: string) => void;
  onUpdateBlock: (id: string, patch: Partial<AdditionalBlock>) => void;
}) {
  const [editPos, setEditPos] = useState(false);
  const col = (block as any).color ?? accentColor;
  const blockIcon: Record<string, string> = {
    image: 'image-outline', stat: 'trending-up-outline', chart: 'bar-chart-outline',
    quote_block: 'chatbubble-outline', divider: 'remove-outline', spacer: 'resize-outline', icon: 'shapes-outline',
  };

  const pos        = block.position ?? { type: 'inline' };
  const isOverlay  = pos.type === 'overlay';
  const supportsH  = block.type === 'image' || block.type === 'stat';

  return (
    <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: isOverlay ? `${COLORS.primary}40` : COLORS.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.md, paddingVertical: 10, backgroundColor: isOverlay ? `${COLORS.primary}12` : `${col}12`, borderBottomWidth: 1, borderBottomColor: isOverlay ? `${COLORS.primary}20` : `${col}20` }}>
        <Ionicons name={blockIcon[block.type] as any} size={13} color={isOverlay ? COLORS.primary : col} />
        <Text style={{ color: isOverlay ? COLORS.primary : col, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>
          {block.type.replace('_', ' ')} · {isOverlay ? '🎯 On Slide' : '⬇ Below Slide'}
        </Text>
        {isOverlay && (
          <Pressable onPress={() => setEditPos(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${COLORS.primary}18`, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={editPos ? 'chevron-up' : 'locate-outline'} size={13} color={COLORS.primary} />
          </Pressable>
        )}
        <TouchableOpacity
          onPress={() => Alert.alert('Delete Block', `Remove this ${block.type.replace('_', ' ')} block?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDelete(block.id) }])}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${COLORS.error}18`, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="trash-outline" size={13} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      {isOverlay && editPos && (
        <View style={{ padding: SPACING.md }}>
          <JoystickPositionControl
            position={pos}
            onChange={newPos => onUpdateBlock(block.id, { position: newPos } as any)}
            supportsHeight={supportsH}
            accentColor={COLORS.primary}
          />
        </View>
      )}

      {!editPos && (
        <View style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}>
          {block.type === 'stat' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <Text style={{ color: col, fontSize: 20, fontWeight: '900' }}>{block.value}</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm }}>{block.label}</Text>
            </View>
          )}
          {block.type === 'image' && (
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {(block as any).onlineUrl ? '🌐 Online image' : block.uri ? '📷 Device image' : 'No image'}
            </Text>
          )}
          {block.type === 'chart' && <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>📊 {block.chart.title}</Text>}
          {block.type === 'quote_block' && <Text numberOfLines={2} style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontStyle: 'italic' }}>"{block.text}"</Text>}
          {block.type === 'divider' && <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{block.style} divider</Text>}
          {block.type === 'spacer' && <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{block.height}dp spacer</Text>}
          {block.type === 'icon' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={(block.iconName as any) || 'shapes-outline'} size={22} color={col} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {(block as any).iconifyId ?? block.iconName}
              </Text>
            </View>
          )}
          {isOverlay && (
            <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 4 }}>
              Position: x={((pos.xFrac ?? 0.05) * 100).toFixed(0)}% y={((pos.yFrac ?? 0.5) * 100).toFixed(0)}% w={((pos.wFrac ?? 0.9) * 100).toFixed(0)}%
              {pos.hFrac !== undefined ? ` h=${(pos.hFrac * 100).toFixed(0)}%` : ''}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── InlineBlockInserterModal ─────────────────────────────────────────────────

function InlineBlockInserterModal({
  visible,
  infographicData,
  accentColor,
  slide,
  onInsertBlock,
  onOpenOnlineImageSearch,
  onOpenIconifyPicker,
  onClose,
}: {
  visible:                  boolean;
  infographicData?:         InfographicData | null;
  accentColor:              string;
  slide:                    EditableSlide;
  onInsertBlock:            (block: AdditionalBlock) => void;
  onOpenOnlineImageSearch:  () => void;
  onOpenIconifyPicker:      () => void;
  onClose:                  () => void;
}) {
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<BlockTabId>('stat');
  const [position,  setPosition]  = useState<InlineBlockPosition>({
    type:  'overlay',
    xFrac: 0.05,
    yFrac: 0.5,
    wFrac: 0.9,
  });

  const handleInsert = useCallback((block: AdditionalBlock) => {
    if ((block as any).id === '__OPEN_ONLINE_SEARCH__') {
      onClose();
      setTimeout(onOpenOnlineImageSearch, 150);
      return;
    }
    onInsertBlock(block);
    onClose();
  }, [onInsertBlock, onClose, onOpenOnlineImageSearch]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: SPACING.sm, paddingBottom: insets.bottom + SPACING.md, maxHeight: SCREEN_H * 0.92, borderTopWidth: 1, borderTopColor: COLORS.border }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.sm }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <LinearGradient colors={['#6C63FF', '#8B5CF6']} style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }}>
              <Ionicons name="add" size={19} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add Element to Slide</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>Choose type then set placement</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.md, alignItems: 'center' }}
            style={{ flexGrow: 0, flexShrink: 0 }}
          >
            {BLOCK_TABS.map(tab => {
              const active = activeTab === tab.id;
              const isIconTab = tab.id === 'icon';
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    if (isIconTab) { onClose(); setTimeout(onOpenIconifyPicker, 150); return; }
                    setActiveTab(tab.id);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: active ? `${tab.color}18` : COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: active ? tab.color : COLORS.border, flexShrink: 0 }}
                >
                  <Ionicons name={tab.icon as any} size={14} color={active ? tab.color : COLORS.textMuted} />
                  <Text style={{ color: active ? tab.color : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: active ? '700' : '500' }}>
                    {tab.label}{isIconTab ? ' ✦' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.lg }}>
            <View style={{ gap: SPACING.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="layers-outline" size={13} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Placement</Text>
              </View>
              <JoystickPositionControl
                position={position}
                onChange={setPosition}
                supportsHeight={activeTab === 'image' || activeTab === 'stat'}
                accentColor={accentColor}
              />
            </View>
            <View style={{ height: 1, backgroundColor: COLORS.border }} />
            {activeTab === 'image'       && <ImagePanel position={position} slideTitle={slide.title} slideLayout={slide.layout} onInsert={handleInsert} />}
            {activeTab === 'stat'        && <StatPanel  position={position} onInsert={handleInsert} infographicData={infographicData} />}
            {activeTab === 'chart'       && <ChartPanel position={position} onInsert={handleInsert} infographicData={infographicData} />}
            {activeTab === 'quote_block' && <QuotePanel position={position} onInsert={handleInsert} />}
            {activeTab === 'divider'     && <DividerPanel position={position} onInsert={handleInsert} accentColor={accentColor} />}
            {activeTab === 'spacer'      && <SpacerPanel  position={position} onInsert={handleInsert} />}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlideEditorCanvasProps {
  slide:               EditableSlide;
  tokens:              PresentationThemeTokens;
  fontFamily?:         string;
  infographicData?:    InfographicData | null;
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
  onAddBlock:          (block: AdditionalBlock) => void;
  /** Part 41.9: handlers for slide.stats (pre-generated stats in stats layout) */
  onUpdateStat?:       (index: number, patch: Partial<StatItem>) => void;
  onDeleteStat?:       (index: number) => void;
  onAddStatToSlide?:   (stat: StatItem) => void;
  /** Part 30 */
  onOpenOnlineImageSearch?: () => void;
  onOpenIconifyPicker?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SlideEditorCanvas({
  slide, tokens, fontFamily, infographicData, getFormatting, editingText, selectedField,
  onFieldTap, onEditingTextChange, onCommitField,
  onUpdateBullet, onAddBullet, onRemoveBullet,
  onDeleteBlock, onUpdateBlock, onAddBlock,
  onUpdateStat, onDeleteStat, onAddStatToSlide,
  onOpenOnlineImageSearch,
  onOpenIconifyPicker,
}: SlideEditorCanvasProps) {
  const accentColor    = slide.accentColor ?? tokens.primary;
  const editableFields = LAYOUT_FIELDS[slide.layout] ?? ['title'];
  const hasBullets     = ['bullets', 'agenda', 'predictions', 'references'].includes(slide.layout);
  const blocks         = slide.editorData?.additionalBlocks ?? [];

  const bgOverride   = slide.editorData?.backgroundColor;
  const spacingLevel = slide.editorData?.spacing ?? 'default';
  const spacingLabel = SPACING_LABELS[spacingLevel];

  const [showBlockInserter, setShowBlockInserter] = useState(false);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">

      {/* ── SLIDE PREVIEW ── */}
      <View style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.md }}>
        <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: `${accentColor}50`, shadowColor: accentColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 10, backgroundColor: bgOverride ?? tokens.background }}>
          <SlideCard slide={slide} tokens={tokens} scale={CANVAS_SC} fontFamily={fontFamily} noTruncate />
        </View>

        {/* Status chips */}
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
          {blocks.filter(b => b.position?.type === 'overlay').length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
              <Ionicons name="layers-outline" size={9} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '700' }}>
                {blocks.filter(b => b.position?.type === 'overlay').length} element{blocks.filter(b => b.position?.type === 'overlay').length !== 1 ? 's' : ''} on slide
              </Text>
            </View>
          )}
        </View>

        {/* Add element button */}
        <Pressable
          onPress={() => setShowBlockInserter(true)}
          style={{ marginTop: SPACING.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: `${accentColor}12`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1.5, borderColor: `${accentColor}35`, borderStyle: 'dashed' }}
        >
          <LinearGradient colors={[accentColor, `${accentColor}BB`]} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={16} color="#FFF" />
          </LinearGradient>
          <View>
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>Add Element to Slide</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>Image · Stat · Chart · Quote · Divider · Icon ✦</Text>
          </View>
        </Pressable>
      </View>

      {/* ── EDITABLE FIELDS ── */}
      <View style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md, gap: SPACING.sm }}>
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
            <Pressable key={field} onPress={() => onFieldTap(field)} style={{ backgroundColor: isActive ? `${accentColor}12` : COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: isActive ? 2 : 1, borderColor: isActive ? accentColor : COLORS.border, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="pencil-outline" size={12} color={isActive ? accentColor : COLORS.textMuted} />
                <Text style={{ color: isActive ? accentColor : COLORS.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>{FIELD_LABELS[field] ?? field}</Text>
                {!rawValue && <View style={{ backgroundColor: `${COLORS.warning}20`, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ color: COLORS.warning, fontSize: 8, fontWeight: '700' }}>EMPTY</Text></View>}
                <View style={{ flexDirection: 'row', gap: 4, marginLeft: 'auto' as any }}>
                  {fmt.bold   && <Text style={{ color: COLORS.primary, fontSize: 9, fontWeight: '900' }}>B</Text>}
                  {fmt.italic && <Text style={{ color: COLORS.primary, fontSize: 9, fontStyle: 'italic' }}>I</Text>}
                  {fmt.color  && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fmt.color }} />}
                </View>
              </View>
              <Text style={{ color: fmt.color ?? (rawValue ? COLORS.textSecondary : COLORS.textMuted), fontSize: FONTS.sizes.sm, lineHeight: 20, fontWeight: (fmt.bold ? '700' : '400') as any, fontStyle: (fmt.italic ? 'italic' : rawValue ? 'normal' : 'italic') as any, textAlign: fmt.alignment ?? 'left' }}>
                {rawValue || `Tap to add ${FIELD_LABELS[field] ?? field}…`}
              </Text>
            </Pressable>
          );
        })}

        {/* Bullets */}
        {hasBullets && (
          <BulletEditor bullets={slide.bullets ?? []} accentColor={accentColor} onUpdate={onUpdateBullet} onAdd={onAddBullet} onRemove={onRemoveBullet} />
        )}

        {/* ── Part 41.9: Interactive editable stats section ── */}
        {slide.layout === 'stats' && (
          <EditableStatsSection
            stats={slide.stats ?? []}
            accentColor={accentColor}
            onUpdate={(index, patch) => onUpdateStat?.(index, patch)}
            onDelete={index => onDeleteStat?.(index)}
            onAdd={stat => onAddStatToSlide?.(stat)}
          />
        )}

        {/* Speaker notes */}
        {slide.speakerNotes ? (
          <Pressable onPress={() => onFieldTap('speakerNotes')} style={{ backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.info}25` }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="reader-outline" size={13} color={COLORS.info} />
              <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>Speaker Notes</Text>
              <Ionicons name="pencil-outline" size={11} color={COLORS.info} />
            </View>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 17, fontStyle: 'italic' }}>{slide.speakerNotes}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => onFieldTap('speakerNotes')} style={{ backgroundColor: `${COLORS.info}06`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.info}18`, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="reader-outline" size={15} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontStyle: 'italic', flex: 1 }}>No speaker notes — tap to write, or use AI ✦ → Notes tab</Text>
          </Pressable>
        )}

        {/* ── BLOCKS ── */}
        {blocks.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.xs }}>
              <View style={{ flex: 1, height: 1.5, backgroundColor: `${accentColor}30` }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${accentColor}12`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Ionicons name="layers-outline" size={11} color={accentColor} />
                <Text style={{ color: accentColor, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {blocks.length} element{blocks.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={{ flex: 1, height: 1.5, backgroundColor: `${accentColor}30` }} />
            </View>

            <View style={{ gap: SPACING.md }}>
              {blocks.map(block => (
                <OverlayBlockCard
                  key={block.id}
                  block={block}
                  accentColor={accentColor}
                  onDelete={onDeleteBlock}
                  onUpdateBlock={onUpdateBlock}
                />
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${accentColor}06`, borderRadius: RADIUS.lg, padding: SPACING.sm }}>
              <Ionicons name="information-circle-outline" size={12} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: 9, flex: 1, lineHeight: 13 }}>
                🎯 "On Slide" elements appear inside the canvas. ⬇ "Below Slide" elements stack after slide content in export.
              </Text>
            </View>
          </>
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

      {/* Block inserter modal */}
      <InlineBlockInserterModal
        visible={showBlockInserter}
        infographicData={infographicData}
        accentColor={accentColor}
        slide={slide}
        onInsertBlock={block => { onAddBlock(block); setShowBlockInserter(false); }}
        onOpenOnlineImageSearch={() => { setShowBlockInserter(false); onOpenOnlineImageSearch?.(); }}
        onOpenIconifyPicker={() => { setShowBlockInserter(false); onOpenIconifyPicker?.(); }}
        onClose={() => setShowBlockInserter(false)}
      />
    </ScrollView>
  );
}