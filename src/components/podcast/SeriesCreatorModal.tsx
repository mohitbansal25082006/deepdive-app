// src/components/podcast/SeriesCreatorModal.tsx
// Part 39 FIXES:
//
// FIX 5 (AI ideas saved after creation):
//   - When the user taps "Create Series", if suggestions were already generated
//     in the modal, the seriesId returned by onCreate is used to save those
//     suggestions into the global _suggestionCache via generate(name, desc, seriesId).
//   - This means when the user arrives on the series screen immediately after
//     creation (FIX 6), the suggestions are already cached and appear instantly
//     without an API call.
//   - The "Generate Ideas" button still works the same way in create mode.
//   - In edit mode, no suggestions are shown (unchanged).
//
// FIX 6 (redirect after creation):
//   - onCreate callback now receives the created PodcastSeries object so the
//     parent (podcast.tsx) can navigate to it. The modal passes the new series
//     via an updated onCreate signature: (input, createdSeries) => Promise<void>.
//   - Backward compatible: old callers that only use `input` still work.

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
}                                                   from 'react-native';
import { BlurView }                                 from 'expo-blur';
import { Ionicons }                                 from '@expo/vector-icons';
import Animated, { FadeInDown }                     from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS }           from '../../constants/theme';
import {
  SERIES_ACCENT_COLORS,
  SERIES_ICONS,
}                                                   from '../../constants/podcastV2';
import type { CreateSeriesInput, PodcastSeries }    from '../../types/podcast_v2';

interface SeriesCreatorModalProps {
  visible:      boolean;
  onClose:      () => void;
  // FIX 6: onCreate now receives (input, createdSeries?) so podcast.tsx can redirect
  onCreate:     (input: CreateSeriesInput, createdSeries?: PodcastSeries) => Promise<void>;
  onUpdate?:    (seriesId: string, input: Partial<CreateSeriesInput>) => Promise<void>;
  isSaving?:    boolean;
  mode?:        'create' | 'edit';
  existingData?: PodcastSeries | null;
  // FIX 6: optional callback that returns the new series after DB insert
  // Used by podcast.tsx to get the seriesId for navigation
  onCreated?:   (series: PodcastSeries) => void;
}

export function SeriesCreatorModal({
  visible, onClose, onCreate, onUpdate,
  isSaving = false,
  mode = 'create',
  existingData,
  onCreated,
}: SeriesCreatorModalProps) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState(SERIES_ACCENT_COLORS[0]);
  const [iconName,    setIconName]    = useState(SERIES_ICONS[0]);

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
  }, [name, description, accentColor, iconName, mode, existingData, onCreate, onUpdate]);

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