// src/components/editor/BlockInserter.tsx
// Part 28 — Slide Canvas Editor: Block inserter bottom sheet
// ─────────────────────────────────────────────────────────────────────────────
//
// Lets the user add new content blocks to the active slide.
// Block types: Image | Chart | Stat | Quote | Divider | Spacer | Icon
//
// "Chart" and "Stat" blocks show a picker of items already extracted from
// the research report (infographicData). The user can also create custom ones.
//
// "Image" opens the device photo library via expo-image-picker.
//
// "Icon" delegates to the separate IconPicker component.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient }     from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import * as ImagePicker       from 'expo-image-picker';
import { useSafeAreaInsets }  from 'react-native-safe-area-context';

import { IconPicker }                      from './IconPicker';
import { COLORS, FONTS, SPACING, RADIUS }  from '../../constants/theme';
import { DIVIDER_STYLES, DEFAULT_ICON_SIZE, DEFAULT_SPACER_HEIGHT } from '../../constants/editor';
import type {
  AdditionalBlock,
  ImageBlock, ChartBlock, StatBlock, QuoteBlock,
  DividerBlock, SpacerBlock, IconBlock, DividerStyle,
} from '../../types/editor';
import type { InfographicData } from '../../types';

// ─── Block type tabs ──────────────────────────────────────────────────────────

interface BlockTab {
  id:    AdditionalBlock['type'];
  label: string;
  icon:  string;
  color: string;
}

const BLOCK_TABS: BlockTab[] = [
  { id: 'image',       label: 'Image',   icon: 'image-outline',        color: '#4FACFE' },
  { id: 'stat',        label: 'Stat',    icon: 'stats-chart-outline',  color: '#6C63FF' },
  { id: 'chart',       label: 'Chart',   icon: 'bar-chart-outline',    color: '#8B5CF6' },
  { id: 'quote_block', label: 'Quote',   icon: 'chatbubble-outline',   color: '#FF6584' },
  { id: 'divider',     label: 'Divider', icon: 'remove-outline',       color: '#43E97B' },
  { id: 'spacer',      label: 'Spacer',  icon: 'expand-outline',       color: '#FFA726' },
  { id: 'icon',        label: 'Icon',    icon: 'shapes-outline',       color: '#29B6F6' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlockInserterProps {
  visible:          boolean;
  infographicData?: InfographicData | null;
  accentColor?:     string;
  onInsertBlock:    (block: AdditionalBlock) => void;
  onClose:          () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const SCREEN_H = Dimensions.get('window').height;

// ─── Tab content panels ───────────────────────────────────────────────────────

// ── Image ──

function ImagePanel({ onInsert }: { onInsert: (block: ImageBlock) => void }) {
  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to insert images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      onInsert({
        type:        'image',
        id:          uid(),
        uri:         asset.uri,
        caption:     '',
        aspectRatio: asset.width && asset.height ? asset.width / asset.height : 16 / 9,
      });
    }
  }, [onInsert]);

  return (
    <View style={{ gap: SPACING.md }}>
      <Pressable onPress={handlePickImage}>
        <LinearGradient
          colors={['#4FACFE', '#00F2FE']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm }}
        >
          <Ionicons name="image" size={36} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Choose from Photos</Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.xs }}>
            Pick an image from your device library
          </Text>
        </LinearGradient>
      </Pressable>
      <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>About image blocks</Text>
        </View>
        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>
          Images are stored locally and embedded into exported PDFs and PPTX files. Portrait photos are automatically cropped to 16:9.
        </Text>
      </View>
    </View>
  );
}

// ── Stat ──

function StatPanel({ onInsert, infographicData }: { onInsert: (block: StatBlock) => void; infographicData?: InfographicData | null }) {
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [unit,  setUnit]  = useState('');

  const handleAdd = useCallback(() => {
    if (!value.trim() || !label.trim()) {
      Alert.alert('Missing fields', 'Please fill in both the stat value and label.');
      return;
    }
    onInsert({
      type:  'stat',
      id:    uid(),
      value: value.trim(),
      label: label.trim(),
      unit:  unit.trim() || undefined,
      color: COLORS.primary,
    });
    setValue(''); setLabel(''); setUnit('');
  }, [value, label, unit, onInsert]);

  const existingStats = infographicData?.stats ?? [];

  return (
    <View style={{ gap: SPACING.md }}>
      {/* Pre-extracted stats from report */}
      {existingStats.length > 0 && (
        <>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
            From Your Report
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
            {existingStats.slice(0, 8).map(stat => (
              <Pressable
                key={stat.id}
                onPress={() => onInsert({ type: 'stat', id: uid(), value: stat.value, label: stat.label, color: stat.color ?? COLORS.primary })}
                style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, width: 120, alignItems: 'center' }}
              >
                <Text style={{ color: stat.color ?? COLORS.primary, fontSize: FONTS.sizes.lg, fontWeight: '900' }}>{stat.value}</Text>
                <Text numberOfLines={2} style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: 4 }}>{stat.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ height: 1, backgroundColor: COLORS.border }} />
        </>
      )}

      {/* Custom stat form */}
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
        Custom Stat
      </Text>
      {[
        { label: 'Value *', value: value, set: setValue, placeholder: 'e.g. 87% or $4.2B' },
        { label: 'Label *', value: label, set: setLabel, placeholder: 'e.g. Market Growth' },
        { label: 'Unit (optional)', value: unit, set: setUnit, placeholder: 'e.g. per year' },
      ].map(field => (
        <View key={field.label} style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>{field.label}</Text>
          <TextInput
            value={field.value}
            onChangeText={field.set}
            placeholder={field.placeholder}
            placeholderTextColor={COLORS.textMuted}
            style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, paddingVertical: 8 }}
          />
        </View>
      ))}
      <Pressable onPress={handleAdd}>
        <LinearGradient
          colors={['#6C63FF', '#8B5CF6']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
        >
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add Stat Card</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ── Chart ──

function ChartPanel({ onInsert, infographicData }: { onInsert: (block: ChartBlock) => void; infographicData?: InfographicData | null }) {
  const charts = infographicData?.charts ?? [];

  if (charts.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
        <Ionicons name="bar-chart-outline" size={40} color={COLORS.textMuted} />
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.md, textAlign: 'center' }}>
          No charts found in this report's research data.{'\n'}Charts are generated automatically for reports with statistics.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: SPACING.sm }}>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.xs }}>
        Available Charts ({charts.length})
      </Text>
      {charts.slice(0, 6).map(chart => (
        <Pressable
          key={chart.id}
          onPress={() => onInsert({ type: 'chart', id: uid(), chart })}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md }}
        >
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${COLORS.primary}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ionicons
              name={chart.type === 'bar' ? 'bar-chart-outline' : chart.type === 'pie' ? 'pie-chart-outline' : chart.type === 'line' ? 'trending-up-outline' : 'stats-chart-outline'}
              size={20}
              color={COLORS.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{chart.title}</Text>
            {chart.subtitle && <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{chart.subtitle}</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>{chart.type} chart</Text>
              </View>
            </View>
          </View>
          <Ionicons name="add-circle-outline" size={22} color={COLORS.primary} />
        </Pressable>
      ))}
    </View>
  );
}

// ── Quote Block ──

function QuotePanel({ onInsert }: { onInsert: (block: QuoteBlock) => void }) {
  const [text,   setText]   = useState('');
  const [attrib, setAttrib] = useState('');

  const handleAdd = useCallback(() => {
    if (!text.trim()) { Alert.alert('Missing quote', 'Please enter the quote text.'); return; }
    onInsert({ type: 'quote_block', id: uid(), text: text.trim(), attribution: attrib.trim() || undefined });
    setText(''); setAttrib('');
  }, [text, attrib, onInsert]);

  return (
    <View style={{ gap: SPACING.md }}>
      <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>Quote Text *</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Enter the pull-quote text…"
          placeholderTextColor={COLORS.textMuted}
          multiline
          numberOfLines={3}
          style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 8, minHeight: 72, textAlignVertical: 'top', fontStyle: text ? 'italic' : 'normal' }}
        />
      </View>
      <View style={{ backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 8 }}>Attribution (optional)</Text>
        <TextInput
          value={attrib}
          onChangeText={setAttrib}
          placeholder="Name, Organization, Year"
          placeholderTextColor={COLORS.textMuted}
          style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, paddingVertical: 8 }}
        />
      </View>
      <Pressable onPress={handleAdd}>
        <LinearGradient
          colors={['#FF6584', '#F093FB']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
        >
          <Ionicons name="chatbubble" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add Quote Block</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ── Divider ──

function DividerPanel({ onInsert, accentColor }: { onInsert: (block: DividerBlock) => void; accentColor: string }) {
  const [selected, setSelected] = useState<DividerStyle>('solid');

  return (
    <View style={{ gap: SPACING.md }}>
      {DIVIDER_STYLES.map(style => (
        <Pressable
          key={style.id}
          onPress={() => setSelected(style.id)}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: selected === style.id ? `${COLORS.primary}12` : COLORS.backgroundElevated, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1.5, borderColor: selected === style.id ? COLORS.primary : COLORS.border, gap: SPACING.md }}
        >
          <Ionicons name={style.icon as any} size={22} color={selected === style.id ? COLORS.primary : COLORS.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: selected === style.id ? COLORS.textPrimary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>{style.label}</Text>
            {/* Visual preview */}
            <View style={{ marginTop: 6, height: 4, width: '80%', justifyContent: 'center' }}>
              {style.id === 'solid'   && <View style={{ height: 1.5, backgroundColor: accentColor }} />}
              {style.id === 'dashed'  && <View style={{ height: 1.5, borderWidth: 1, borderColor: accentColor, borderStyle: 'dashed' }} />}
              {style.id === 'diamond' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {[0,1,2,3,4].map(i => (
                    <View key={i} style={{ width: 5, height: 5, backgroundColor: accentColor, transform: [{ rotate: '45deg' }] }} />
                  ))}
                </View>
              )}
            </View>
          </View>
          {selected === style.id && (
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={12} color="#FFF" />
            </View>
          )}
        </Pressable>
      ))}
      <Pressable onPress={() => onInsert({ type: 'divider', id: uid(), style: selected, color: accentColor })}>
        <LinearGradient
          colors={['#43E97B', '#38F9D7']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
        >
          <Ionicons name="remove" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add {DIVIDER_STYLES.find(s => s.id === selected)?.label} Divider</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ── Spacer ──

function SpacerPanel({ onInsert }: { onInsert: (block: SpacerBlock) => void }) {
  const options = [12, 24, 48, 72];
  const [selected, setSelected] = useState(24);

  return (
    <View style={{ gap: SPACING.md }}>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
        Spacer Height
      </Text>
      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
        {options.map(h => (
          <Pressable
            key={h}
            onPress={() => setSelected(h)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: SPACING.md, backgroundColor: selected === h ? `${COLORS.primary}18` : COLORS.backgroundElevated, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: selected === h ? COLORS.primary : COLORS.border, gap: 4 }}
          >
            <Text style={{ color: selected === h ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>{h}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600' }}>dp</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => onInsert({ type: 'spacer', id: uid(), height: selected })}>
        <LinearGradient
          colors={['#FFA726', '#FF7043']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
        >
          <Ionicons name="expand" size={18} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add {selected}dp Spacer</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BlockInserter({
  visible,
  infographicData,
  accentColor = COLORS.primary,
  onInsertBlock,
  onClose,
}: BlockInserterProps) {
  const insets = useSafeAreaInsets();

  const [activeTab,     setActiveTab]     = useState<AdditionalBlock['type']>('stat');
  const [showIconPicker, setShowIconPicker] = useState(false);

  const handleInsert = useCallback((block: AdditionalBlock) => {
    onInsertBlock(block);
    onClose();
  }, [onInsertBlock, onClose]);

  const handleIconSelect = useCallback((iconName: string) => {
    handleInsert({
      type:     'icon',
      id:       uid(),
      iconName,
      size:     DEFAULT_ICON_SIZE,
      color:    accentColor,
    });
  }, [handleInsert, accentColor]);

  const activeTabMeta = BLOCK_TABS.find(t => t.id === activeTab);

  return (
    <>
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
              paddingBottom:        insets.bottom + SPACING.md,
              maxHeight:            SCREEN_H * 0.85,
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
                <Ionicons name="add" size={19} color="#FFF" />
              </LinearGradient>
              <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>Add Content Block</Text>
              <Pressable onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </Pressable>
            </View>

            {/* Tab strip */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.md }}
            >
              {BLOCK_TABS.map(tab => {
                const active = activeTab === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => {
                      if (tab.id === 'icon') {
                        setShowIconPicker(true);
                        onClose();
                        return;
                      }
                      setActiveTab(tab.id);
                    }}
                    style={{
                      flexDirection:   'row',
                      alignItems:      'center',
                      gap:             5,
                      backgroundColor: active ? `${tab.color}18` : COLORS.backgroundElevated,
                      borderRadius:    RADIUS.full,
                      paddingHorizontal: 12,
                      paddingVertical:  8,
                      borderWidth:     1,
                      borderColor:     active ? tab.color : COLORS.border,
                    }}
                  >
                    <Ionicons name={tab.icon as any} size={14} color={active ? tab.color : COLORS.textMuted} />
                    <Text style={{ color: active ? tab.color : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: active ? '700' : '500' }}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Active tab content */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg }}
            >
              {activeTab === 'image'       && <ImagePanel   onInsert={handleInsert} />}
              {activeTab === 'stat'        && <StatPanel    onInsert={handleInsert} infographicData={infographicData} />}
              {activeTab === 'chart'       && <ChartPanel   onInsert={handleInsert} infographicData={infographicData} />}
              {activeTab === 'quote_block' && <QuotePanel   onInsert={handleInsert} />}
              {activeTab === 'divider'     && <DividerPanel onInsert={handleInsert} accentColor={accentColor} />}
              {activeTab === 'spacer'      && <SpacerPanel  onInsert={handleInsert} />}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Icon picker — opens separately */}
      <IconPicker
        visible={showIconPicker}
        iconColor={accentColor}
        onSelectIcon={handleIconSelect}
        onClose={() => setShowIconPicker(false)}
      />
    </>
  );
}