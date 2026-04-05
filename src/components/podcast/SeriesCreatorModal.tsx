// src/components/podcast/SeriesCreatorModal.tsx
// Part 39 FIX — Edit mode + AI topic suggestions.
//
// FIX 2 (Series suggestions): After filling in name + description, a
//   "Get AI Episode Ideas" button generates 4 episode topic suggestions
//   tailored to the series concept. Suggestions shown as tappable chips.
//
// FIX 4 (Edit mode): Accepts `mode: 'create' | 'edit'` and `existingData`
//   to pre-fill fields. Header and button text adapt accordingly.
//
// USAGE:
//   Create: <SeriesCreatorModal visible onClose={...} onCreate={...} />
//   Edit:   <SeriesCreatorModal visible mode="edit" existingData={series}
//             onClose={...} onCreate={...} onUpdate={...} />

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
}                                                   from 'react-native';
import { BlurView }                                 from 'expo-blur';
import { Ionicons }                                 from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown }             from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS }           from '../../constants/theme';
import {
  SERIES_ACCENT_COLORS,
  SERIES_ICONS,
}                                                   from '../../constants/podcastV2';
import { useSeriesTopicSuggestions }                from '../../hooks/usePodcastSeries';
import type { CreateSeriesInput, PodcastSeries }    from '../../types/podcast_v2';
import type { SeriesTopicSuggestion }               from '../../services/podcastSeriesService';

interface SeriesCreatorModalProps {
  visible:      boolean;
  onClose:      () => void;
  onCreate:     (input: CreateSeriesInput) => Promise<void>;
  onUpdate?:    (seriesId: string, input: Partial<CreateSeriesInput>) => Promise<void>;
  isSaving?:    boolean;
  mode?:        'create' | 'edit';
  existingData?: PodcastSeries | null;
}

export function SeriesCreatorModal({
  visible, onClose, onCreate, onUpdate,
  isSaving = false,
  mode = 'create',
  existingData,
}: SeriesCreatorModalProps) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState(SERIES_ACCENT_COLORS[0]);
  const [iconName,    setIconName]    = useState(SERIES_ICONS[0]);

  const { suggestions, loading: loadingRec, generate: generateSuggestions, clear: clearSuggestions } =
    useSeriesTopicSuggestions();

  // Pre-fill for edit mode
  useEffect(() => {
    if (visible && mode === 'edit' && existingData) {
      setName(existingData.name);
      setDescription(existingData.description);
      setAccentColor(existingData.accentColor);
      setIconName(existingData.iconName);
    } else if (visible && mode === 'create') {
      setName('');
      setDescription('');
      setAccentColor(SERIES_ACCENT_COLORS[0]);
      setIconName(SERIES_ICONS[0]);
      clearSuggestions();
    }
  }, [visible, mode, existingData?.id]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) return;
    const input: CreateSeriesInput = {
      name:        name.trim(),
      description: description.trim(),
      accentColor,
      iconName,
    };

    if (mode === 'edit' && existingData && onUpdate) {
      await onUpdate(existingData.id, input);
    } else {
      await onCreate(input);
    }

    clearSuggestions();
  }, [name, description, accentColor, iconName, mode, existingData, onCreate, onUpdate, clearSuggestions]);

  const handleGetSuggestions = useCallback(() => {
    if (name.trim().length < 2) return;
    generateSuggestions(name.trim(), description.trim());
  }, [name, description, generateSuggestions]);

  const canSubmit = name.trim().length >= 2 && !isSaving;
  const isEdit    = mode === 'edit';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.7)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={{
              backgroundColor:      COLORS.backgroundCard,
              borderTopLeftRadius:  28,
              borderTopRightRadius: 28,
              borderTopWidth:       1,
              borderTopColor:       COLORS.border,
              maxHeight:            '92%',
            }}
          >
            {/* Handle */}
            <View style={{
              width: 40, height: 4, borderRadius: 2,
              backgroundColor: COLORS.border, alignSelf: 'center',
              marginTop: SPACING.sm, marginBottom: SPACING.md,
            }} />

            <ScrollView
              contentContainerStyle={{ padding: SPACING.xl, paddingBottom: SPACING.xl + 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl }}>
                <View>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>
                    {isEdit ? 'Edit Series' : 'New Series'}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 }}>
                    {isEdit ? 'Update your series details' : 'Group related episodes into a series'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: COLORS.backgroundElevated,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: COLORS.border,
                  }}
                >
                  <Ionicons name="close" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Preview */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
                marginBottom: SPACING.xl, padding: SPACING.md,
                backgroundColor: COLORS.backgroundElevated,
                borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border,
              }}>
                <View style={{
                  width: 52, height: 52, borderRadius: 16,
                  backgroundColor: `${accentColor}25`,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: `${accentColor}40`,
                }}>
                  <Ionicons name={iconName as any} size={24} color={accentColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }} numberOfLines={1}>
                    {name.trim() || 'Series Name'}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 }} numberOfLines={1}>
                    {description.trim() || 'Series description...'}
                  </Text>
                </View>
              </View>

              {/* Name */}
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING.sm }}>
                Series Name *
              </Text>
              <View style={{
                backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg,
                borderWidth: 1, borderColor: COLORS.border,
                paddingHorizontal: SPACING.md, paddingVertical: 12, marginBottom: SPACING.md,
              }}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="E.g. AI Deep Dives, Weekly Tech..."
                  placeholderTextColor={COLORS.textMuted}
                  style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base }}
                  maxLength={60}
                  autoFocus={mode === 'create'}
                />
              </View>

              {/* Description */}
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING.sm }}>
                Description
              </Text>
              <View style={{
                backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg,
                borderWidth: 1, borderColor: COLORS.border,
                paddingHorizontal: SPACING.md, paddingVertical: 12, marginBottom: SPACING.lg,
              }}>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What is this series about? Who is it for?"
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  style={{
                    color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                    minHeight: 60, textAlignVertical: 'top',
                  }}
                  maxLength={200}
                />
              </View>

              {/* FIX 2: AI Episode Suggestions (create mode only) */}
              {mode === 'create' && (
                <View style={{ marginBottom: SPACING.lg }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                      AI Episode Ideas
                    </Text>
                    <TouchableOpacity
                      onPress={handleGetSuggestions}
                      disabled={name.trim().length < 2 || loadingRec}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: name.trim().length >= 2 ? `${COLORS.primary}15` : COLORS.backgroundElevated,
                        borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5,
                        borderWidth: 1, borderColor: name.trim().length >= 2 ? `${COLORS.primary}35` : COLORS.border,
                        opacity: name.trim().length < 2 ? 0.4 : 1,
                      }}
                    >
                      {loadingRec
                        ? <ActivityIndicator size="small" color={COLORS.primary} />
                        : <Ionicons name="sparkles" size={12} color={COLORS.primary} />}
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                        {loadingRec ? 'Generating...' : 'Generate Ideas'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {suggestions.length === 0 && !loadingRec && (
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 18 }}>
                      {name.trim().length >= 2
                        ? 'Tap "Generate Ideas" to get AI-powered episode topic suggestions for this series.'
                        : 'Enter a series name first to get topic suggestions.'}
                    </Text>
                  )}

                  {suggestions.map((sug, idx) => (
                    <SuggestionCard key={idx} suggestion={sug} accentColor={accentColor} index={idx} />
                  ))}
                </View>
              )}

              {/* Color picker */}
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING.sm }}>
                Color
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: SPACING.lg }}>
                {SERIES_ACCENT_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setAccentColor(color)}
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      backgroundColor: color,
                      borderWidth:     accentColor === color ? 3 : 1.5,
                      borderColor:     accentColor === color ? COLORS.textPrimary : 'transparent',
                    }}
                  />
                ))}
              </View>

              {/* Icon picker */}
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING.sm }}>
                Icon
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: SPACING.xl }}>
                {SERIES_ICONS.map(icon => (
                  <TouchableOpacity
                    key={icon}
                    onPress={() => setIconName(icon)}
                    style={{
                      width: 44, height: 44, borderRadius: 13,
                      backgroundColor: iconName === icon ? `${accentColor}20` : COLORS.backgroundElevated,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: iconName === icon ? accentColor : COLORS.border,
                    }}
                  >
                    <Ionicons
                      name={icon as any} size={20}
                      color={iconName === icon ? accentColor : COLORS.textMuted}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Submit button */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={{
                  backgroundColor: canSubmit ? accentColor : COLORS.backgroundElevated,
                  borderRadius: RADIUS.lg,
                  paddingVertical: 16,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: canSubmit ? 1 : 0.5,
                }}
              >
                {isSaving
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name={isEdit ? 'checkmark-circle' : 'add-circle'} size={20} color="#FFF" />}
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                  {isSaving
                    ? (isEdit ? 'Saving...' : 'Creating...')
                    : (isEdit ? 'Save Changes' : 'Create Series')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

// ─── Suggestion Card ──────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion, accentColor, index,
}: {
  suggestion: SeriesTopicSuggestion;
  accentColor: string;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Animated.View entering={FadeIn.duration(300).delay(index * 80)}>
      <TouchableOpacity
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
        style={{
          backgroundColor: COLORS.backgroundElevated,
          borderRadius: RADIUS.lg,
          padding: SPACING.md,
          marginBottom: SPACING.sm,
          borderWidth: 1,
          borderColor: `${accentColor}30`,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{
            width: 28, height: 28, borderRadius: 8,
            backgroundColor: `${accentColor}20`,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
          }}>
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>
              E{index + 1}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', lineHeight: 20,
            }} numberOfLines={expanded ? undefined : 2}>
              {suggestion.topic}
            </Text>
            {expanded && (
              <View style={{ marginTop: SPACING.sm }}>
                <Text style={{
                  color: COLORS.primary, fontSize: FONTS.sizes.xs,
                  fontStyle: 'italic', marginBottom: 6, lineHeight: 16,
                }}>
                  "{suggestion.hookLine}"
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  <Chip label={`👤 ${suggestion.guestType}`} color={accentColor} />
                  <Chip label={`🎙 ${suggestion.episodeFormat}`} color={COLORS.secondary} />
                </View>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
                  ⚡ {suggestion.whyNow}
                </Text>
              </View>
            )}
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14} color={COLORS.textMuted}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{
      backgroundColor: `${color}12`, borderRadius: RADIUS.full,
      paddingHorizontal: 8, paddingVertical: 3,
      borderWidth: 1, borderColor: `${color}25`,
    }}>
      <Text style={{ color, fontSize: 10, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}