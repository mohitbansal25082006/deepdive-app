// app/(app)/podcast-series.tsx
// Part 39 FIXES applied:
//
// FIX 1 (voice quality in series generator):
//   InlineEpisodeGenerator now includes the Audio Quality selector, matching
//   the main podcast tab. The quality add-on credit cost is shown in the
//   generate button.
//
// FIX 3 (series episode count):
//   refresh() now calls usePodcastSeries().refresh() in addition to
//   useSeriesDetail().refresh() so the podcast tab's series list also updates.
//
// FIX 4 (deleted series not removed from tab):
//   handleDeleteSeries() now calls refreshSeriesList() from usePodcastSeries()
//   BEFORE router.back() so the tab's series list is already updated when
//   the user arrives back on the podcast tab.
//
// FIX 5 (AI starter ideas persist + regenerate button):
//   - InitialSuggestionsPanel receives an onRegenerate prop and shows a
//     "↻ Regenerate" button after the first load.
//   - loadInitialSuggestions(force=true) is wired to the regenerate button.
//   - Suggestions are cached globally in usePodcastSeries so navigating away
//     and back does NOT re-generate — they appear instantly from cache.
//   - SeriesCreatorModal suggestions are now saved to the cache via seriesId
//     so they appear on the series screen immediately after creation.
//
// GENERATION FIXES:
//   - InlineEpisodeGenerator now passes webSearchActive correctly (reads
//     EXPO_PUBLIC_SERPAPI_KEY just like the main podcast tab).
//   - Cancel button in InlineEpisodeGenerator now shows a confirmation Alert
//     ("Keep Going" / "Stop") before calling reset, matching the main tab UX.

import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient }               from 'expo-linear-gradient';
import { Ionicons }                     from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }                 from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';
import {
  useSeriesDetail,
  usePodcastSeries,
} from '../../src/hooks/usePodcastSeries';
import { usePodcast }                   from '../../src/hooks/usePodcast';
import { usePodcastHistory }            from '../../src/hooks/usePodcastHistory';
import { SeriesCreatorModal }           from '../../src/components/podcast/SeriesCreatorModal';
import { EpisodeArtwork }              from '../../src/components/podcast/EpisodeArtwork';
import { VoiceStyleSelector }           from '../../src/components/podcast/VoiceStyleSelector';
import { PodcastGenerationProgress }    from '../../src/components/podcast/PodcastGenerationProgress';
import { useCreditGate }                from '../../src/hooks/useCreditGate';
import { InsufficientCreditsModal }     from '../../src/components/credits/InsufficientCreditsModal';
import {
  podcastDurationToFeature,
  podcastTotalCost,
  FEATURE_COSTS,
}                                       from '../../src/constants/credits';
import { PODCAST_VOICE_PRESETS_V2, AUDIO_QUALITY_OPTIONS } from '../../src/constants/podcastV2';
import type { SeriesEpisodeSummary }    from '../../src/services/podcastSeriesService';
import type { AdvancedNextEpisodeRecommendation, SeriesTopicSuggestion } from '../../src/services/podcastSeriesService';
import type { PodcastVoicePresetV2Def, AudioQuality } from '../../src/types/podcast_v2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  if (secs <= 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit',
  });
}

// ─── Tag Chip ──────────────────────────────────────────────────────────────────

function TagChip({ label, color }: { label: string; color: string }) {
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

// ─── Episode Row ───────────────────────────────────────────────────────────────

function EpisodeRow({
  episode, index, accentColor, onPlay, onRemove,
}: {
  episode:     SeriesEpisodeSummary;
  index:       number;
  accentColor: string;
  onPlay:      () => void;
  onRemove:    () => void;
}) {
  const isCompleted = episode.status === 'completed';

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 50)}>
      <TouchableOpacity
        onPress={isCompleted ? onPlay : undefined}
        activeOpacity={isCompleted ? 0.75 : 1}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
          padding: SPACING.md, backgroundColor: COLORS.backgroundCard,
          borderRadius: RADIUS.xl, marginBottom: SPACING.sm,
          borderWidth: 1, borderColor: COLORS.border,
        }}
      >
        <EpisodeArtwork
          title={episode.title} size={52}
          episodeNum={episode.episodeNumber} accentColor={accentColor}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 3 }}
            numberOfLines={2}
          >
            {episode.title}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {isCompleted && episode.durationSeconds > 0 && (
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {formatDuration(episode.durationSeconds)}
              </Text>
            )}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {formatDate(episode.createdAt)}
            </Text>
            {!isCompleted && (
              <View style={{ backgroundColor: `${COLORS.warning}15`, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ color: COLORS.warning, fontSize: 9, fontWeight: '700' }}>IN PROGRESS</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isCompleted && (
            <TouchableOpacity
              onPress={onPlay}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: accentColor,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="play" size={14} color="#FFF" style={{ marginLeft: 1 }} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onRemove}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ padding: 4 }}
          >
            <Ionicons name="remove-circle-outline" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Initial Suggestions Panel ─────────────────────────────────────────────────
// FIX 5: Added onRegenerate prop and Regenerate button

function InitialSuggestionsPanel({
  suggestions, loadingInitial, accentColor, onSelectTopic, onRegenerate,
}: {
  suggestions:    SeriesTopicSuggestion[];
  loadingInitial: boolean;
  accentColor:    string;
  onSelectTopic:  (topic: string) => void;
  onRegenerate:   () => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (loadingInitial) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: SPACING.md, marginBottom: SPACING.lg }}>
        <ActivityIndicator size="small" color={accentColor} />
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>Generating episode ideas...</Text>
      </View>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(500)} style={{ marginBottom: SPACING.lg }}>
      {/* Header row with Regenerate button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm }}>
        <Ionicons name="sparkles" size={14} color={accentColor} />
        <Text style={{ color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '700', flex: 1 }}>
          AI STARTER IDEAS
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginRight: 4 }}>
          Tap to use
        </Text>
        {/* FIX 5: Regenerate button */}
        <TouchableOpacity
          onPress={onRegenerate}
          disabled={loadingInitial}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: `${accentColor}12`, borderRadius: RADIUS.full,
            paddingHorizontal: 8, paddingVertical: 4,
            borderWidth: 1, borderColor: `${accentColor}25`,
          }}
        >
          <Ionicons name="refresh-outline" size={11} color={accentColor} />
          <Text style={{ color: accentColor, fontSize: 10, fontWeight: '700' }}>Regenerate</Text>
        </TouchableOpacity>
      </View>

      {suggestions.map((sug, idx) => (
        <TouchableOpacity
          key={idx}
          onPress={() => setExpanded(expanded === idx ? null : idx)}
          activeOpacity={0.8}
          style={{
            backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl,
            padding: SPACING.md, marginBottom: SPACING.sm,
            borderWidth: 1, borderColor: `${accentColor}25`,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{
              width: 30, height: 30, borderRadius: 9,
              backgroundColor: `${accentColor}20`,
              alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
            }}>
              <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>E{idx + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', lineHeight: 20 }}
                numberOfLines={expanded === idx ? undefined : 2}
              >
                {sug.topic}
              </Text>

              {expanded === idx && (
                <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: SPACING.sm }}>
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontStyle: 'italic', marginBottom: 8, lineHeight: 16 }}>
                    "{sug.hookLine}"
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <TagChip label={`👤 ${sug.guestType}`}     color={accentColor}      />
                    <TagChip label={`🎙 ${sug.episodeFormat}`} color={COLORS.secondary} />
                  </View>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, lineHeight: 16, marginBottom: 12 }}>
                    ⚡ {sug.whyNow}
                  </Text>
                  <TouchableOpacity
                    onPress={() => { onSelectTopic(sug.topic); setExpanded(null); }}
                    style={{
                      backgroundColor: accentColor, borderRadius: RADIUS.lg,
                      paddingVertical: 9,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Ionicons name="create-outline" size={14} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                      Use This Topic
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>
            <Ionicons
              name={expanded === idx ? 'chevron-up' : 'chevron-down'}
              size={14} color={COLORS.textMuted}
            />
          </View>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

// ─── Advanced Recommendation Panel ────────────────────────────────────────────

function AdvancedRecommendationPanel({
  recommendations, loadingRec, accentColor, onLoadRecommendations, onSelectTopic,
}: {
  recommendations:      AdvancedNextEpisodeRecommendation[];
  loadingRec:           boolean;
  accentColor:          string;
  onLoadRecommendations: () => void;
  onSelectTopic:        (topic: string) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const rec = recommendations[activeIdx];

  return (
    <Animated.View entering={FadeIn.duration(500)} style={{ marginBottom: SPACING.lg }}>
      <LinearGradient
        colors={[`${accentColor}15`, `${accentColor}08`]}
        style={{
          borderRadius: RADIUS.xl, padding: SPACING.md,
          borderWidth: 1, borderColor: `${accentColor}30`,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm }}>
          <View style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: `${accentColor}20`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="sparkles" size={16} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              AI NEXT EPISODE PICK
            </Text>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
              Based on your episode history
            </Text>
          </View>
          {!loadingRec && recommendations.length === 0 && (
            <TouchableOpacity
              onPress={onLoadRecommendations}
              style={{
                backgroundColor: accentColor, borderRadius: RADIUS.lg,
                paddingHorizontal: 12, paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Analyse</Text>
            </TouchableOpacity>
          )}
          {!loadingRec && recommendations.length > 0 && (
            <TouchableOpacity
              onPress={onLoadRecommendations}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: `${accentColor}12`, borderRadius: RADIUS.full,
                paddingHorizontal: 8, paddingVertical: 4,
                borderWidth: 1, borderColor: `${accentColor}25`,
              }}
            >
              <Ionicons name="refresh-outline" size={11} color={accentColor} />
              <Text style={{ color: accentColor, fontSize: 10, fontWeight: '700' }}>Refresh</Text>
            </TouchableOpacity>
          )}
        </View>

        {loadingRec && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <ActivityIndicator size="small" color={accentColor} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              Analysing your series arc...
            </Text>
          </View>
        )}

        {rec && (
          <Animated.View entering={FadeIn.duration(300)}>
            {recommendations.length > 1 && (
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.md }}>
                {recommendations.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setActiveIdx(i)}
                    style={{
                      flex: 1, paddingVertical: 6, borderRadius: RADIUS.lg,
                      backgroundColor: activeIdx === i ? accentColor : COLORS.backgroundElevated,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: activeIdx === i ? accentColor : COLORS.border,
                    }}
                  >
                    <Text style={{
                      color: activeIdx === i ? '#FFF' : COLORS.textMuted,
                      fontSize: FONTS.sizes.xs, fontWeight: '700',
                    }}>
                      Option {i + 1}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
              fontWeight: '600', marginBottom: 6, lineHeight: 20,
            }}>
              {rec.suggestedTopic}
            </Text>

            <Text style={{
              color: COLORS.primary, fontSize: FONTS.sizes.xs,
              fontStyle: 'italic', marginBottom: 10, lineHeight: 16,
            }}>
              "{rec.hookLine}"
            </Text>

            <Text style={{
              color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
              marginBottom: 10, lineHeight: 17,
            }}>
              {rec.rationale}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: SPACING.sm }}>
              {rec.connectedThemes?.slice(0, 3).map((theme: string) => (
                <TagChip key={theme} label={theme} color={accentColor} />
              ))}
              {rec.episodeFormat && (
                <TagChip label={`🎙 ${rec.episodeFormat}`} color={COLORS.secondary} />
              )}
            </View>

            {rec.audienceGap && (
              <View style={{
                backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.lg,
                padding: SPACING.sm, marginBottom: SPACING.sm,
                borderWidth: 1, borderColor: `${COLORS.info}20`,
              }}>
                <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, fontWeight: '600', marginBottom: 3 }}>
                  🎯 Answers the listener question:
                </Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 16 }}>
                  {rec.audienceGap}
                </Text>
              </View>
            )}

            {rec.callbackIdea && (
              <View style={{
                backgroundColor: `${COLORS.accent}10`, borderRadius: RADIUS.lg,
                padding: SPACING.sm, marginBottom: SPACING.md,
                borderWidth: 1, borderColor: `${COLORS.accent}20`,
              }}>
                <Text style={{ color: COLORS.accent, fontSize: FONTS.sizes.xs, fontWeight: '600', marginBottom: 3 }}>
                  🔄 Callback idea:
                </Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 16, fontStyle: 'italic' }}>
                  "{rec.callbackIdea}"
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={() => onSelectTopic(rec.suggestedTopic)}
              style={{
                backgroundColor: accentColor, borderRadius: RADIUS.lg, paddingVertical: 10,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Ionicons name="create-outline" size={15} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                Use This Topic
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Inline Episode Generator ──────────────────────────────────────────────────
// FIX 1:   Added Audio Quality selector with credit cost display.
// GEN FIX: webSearchActive now reads EXPO_PUBLIC_SERPAPI_KEY (same as podcast tab).
// GEN FIX: Cancel button shows Alert confirmation before stopping.

interface InlineGeneratorProps {
  seriesId:      string;
  seriesName:    string;
  episodeNum:    number;
  accentColor:   string;
  prefillTopic?: string;
  onComplete:    () => void;
}

function InlineEpisodeGenerator({
  seriesId, seriesName, episodeNum, accentColor, prefillTopic, onComplete,
}: InlineGeneratorProps) {
  const [topic,            setTopic]            = useState(prefillTopic ?? '');
  const [selectedPresetId, setSelectedPresetId] = useState('casual');
  const [selectedDuration, setSelectedDuration] = useState(10);
  // FIX 1: Audio quality state
  const [audioQuality,     setAudioQuality]     = useState<AudioQuality>('standard');

  const { state: genState, isGenerating, progressPhase, generateFromTopic, reset } = usePodcast();
  const { upsertPodcast, refresh: refreshHistory } = usePodcastHistory();
  const { guardedConsumeTotal, insufficientInfo, clearInsufficient, isConsuming } = useCreditGate();

  // GEN FIX: detect SerpAPI availability exactly as the main podcast tab does
  const hasSerpKey = !!(
    process.env.EXPO_PUBLIC_SERPAPI_KEY?.trim() &&
    process.env.EXPO_PUBLIC_SERPAPI_KEY !== 'your_serpapi_key_here'
  );

  // Update topic if a suggestion is selected
  useEffect(() => {
    if (prefillTopic) setTopic(prefillTopic);
  }, [prefillTopic]);

  // On completion, refresh series + history
  useEffect(() => {
    if (progressPhase === 'done' && genState.podcast) {
      upsertPodcast(genState.podcast);
      refreshHistory();
      onComplete();
    }
  }, [progressPhase]);

  const selectedPreset = PODCAST_VOICE_PRESETS_V2.find(p => p.id === selectedPresetId) ?? PODCAST_VOICE_PRESETS_V2[0];

  // FIX 1: Total cost includes duration + quality add-on
  const totalCreditCost = podcastTotalCost(selectedDuration, audioQuality);
  const baseCreditCost  = FEATURE_COSTS[podcastDurationToFeature(selectedDuration)];
  const qualityAddOn    = totalCreditCost - baseCreditCost;

  const handleGenerate = async () => {
    const effectiveTopic = topic.trim();
    if (!effectiveTopic) {
      Alert.alert('Topic Required', 'Please enter a topic for the episode.');
      return;
    }

    // FIX 1: Use guardedConsumeTotal to handle quality add-on correctly
    const qualityLabel =
      audioQuality === 'high'     ? ' · High Quality'     :
      audioQuality === 'lossless' ? ' · Lossless Quality' : '';
    const combinedLabel = `Podcast (${selectedDuration} min${qualityLabel})`;

    const ok = await guardedConsumeTotal(
      podcastDurationToFeature(selectedDuration),
      totalCreditCost,
      combinedLabel,
    );
    if (!ok) return;

    const config = {
      hostVoice:             selectedPreset.hostVoice,
      guestVoice:            selectedPreset.guestVoice,
      hostName:              selectedPreset.hostName,
      guestName:             selectedPreset.guestName,
      targetDurationMinutes: selectedDuration,
    };

    generateFromTopic(
      effectiveTopic,
      config,
      selectedPreset.presetStyleV2 as any,
      {
        speakers:      selectedPreset.speakers,
        speakerCount:  selectedPreset.speakerCount,
        presetStyleV2: selectedPreset.presetStyleV2,
        audioQuality,         // FIX 1: pass quality
        seriesId,
        episodeNumber: episodeNum,
      }
    );
  };

  // GEN FIX: Confirmation alert before cancelling — same UX as main podcast tab
  const handleCancel = useCallback(() => {
    Alert.alert('Cancel Generation', 'Stop generating this podcast?', [
      { text: 'Keep Going', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: reset },
    ]);
  }, [reset]);

  const showProgress = progressPhase === 'script' || progressPhase === 'audio';

  return (
    <Animated.View entering={FadeIn.duration(400)} style={{ marginBottom: SPACING.xl }}>
      <LinearGradient
        colors={[`${accentColor}12`, `${accentColor}06`]}
        style={{
          borderRadius: RADIUS.xl, padding: SPACING.md,
          borderWidth: 1, borderColor: `${accentColor}30`,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.md }}>
          <View style={{
            width: 36, height: 36, borderRadius: 11,
            backgroundColor: `${accentColor}20`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
              E{episodeNum}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              NEW EPISODE
            </Text>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs }}>
              {seriesName} · Episode {episodeNum}
            </Text>
          </View>
          {/* GEN FIX: cancel button now calls handleCancel (shows confirmation) */}
          {isGenerating && (
            <TouchableOpacity onPress={handleCancel} style={{ padding: 6 }}>
              <Ionicons name="stop-circle-outline" size={20} color={COLORS.error} />
            </TouchableOpacity>
          )}
        </View>

        {/* Progress overlay — GEN FIX: webSearchActive reads real SerpAPI key */}
        {showProgress && (
          <View style={{ marginBottom: SPACING.md }}>
            <PodcastGenerationProgress
              isGeneratingScript={genState.isGeneratingScript}
              isGeneratingAudio={genState.isGeneratingAudio}
              scriptGenerated={genState.scriptGenerated}
              audioProgress={genState.audioProgress}
              progressMessage={genState.progressMessage}
              targetDurationMins={selectedDuration}
              webSearchActive={hasSerpKey}
              onCancel={handleCancel}
            />
          </View>
        )}

        {/* Error */}
        {progressPhase === 'error' && genState.error && (
          <View style={{
            backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg,
            padding: SPACING.sm, marginBottom: SPACING.md,
            borderWidth: 1, borderColor: `${COLORS.error}30`,
          }}>
            <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs }}>{genState.error}</Text>
          </View>
        )}

        {!isGenerating && (
          <>
            {/* Topic input */}
            <View style={{
              backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
              borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm,
            }}>
              <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="Episode topic..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
                style={{
                  color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
                  padding: SPACING.md, minHeight: 72, textAlignVertical: 'top',
                  lineHeight: 22,
                }}
              />
            </View>

            {/* Voice style */}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', marginBottom: 6 }}>
              Voice Style
            </Text>
            <View style={{ marginBottom: SPACING.sm }}>
              <VoiceStyleSelector
                selectedPresetId={selectedPresetId}
                onSelectPreset={(p: PodcastVoicePresetV2Def) => setSelectedPresetId(p.id)}
                variant="grid"
              />
            </View>

            {/* Duration */}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', marginBottom: 6 }}>
              Episode Length
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.sm }}>
              {[5, 10, 15, 20].map(dur => {
                const isActive  = selectedDuration === dur;
                const cost      = podcastTotalCost(dur, audioQuality);
                return (
                  <TouchableOpacity
                    key={dur}
                    onPress={() => setSelectedDuration(dur)}
                    style={{
                      flex: 1,
                      backgroundColor: isActive ? accentColor : COLORS.backgroundCard,
                      borderRadius: RADIUS.lg, paddingVertical: 8, alignItems: 'center',
                      borderWidth: 1, borderColor: isActive ? accentColor : COLORS.border,
                    }}
                  >
                    <Text style={{
                      color: isActive ? '#FFF' : COLORS.textSecondary,
                      fontSize: FONTS.sizes.xs, fontWeight: '700',
                    }}>
                      {dur}m
                    </Text>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 2,
                      backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : `${accentColor}12`,
                      borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2,
                    }}>
                      <Ionicons name="flash" size={8} color={isActive ? '#FFF' : accentColor} />
                      <Text style={{ color: isActive ? '#FFF' : accentColor, fontSize: 8, fontWeight: '800' }}>
                        {cost}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* FIX 1: Audio Quality selector */}
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', marginBottom: 6 }}>
              Audio Quality
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.sm }}>
              {AUDIO_QUALITY_OPTIONS.map(opt => {
                const isActive = audioQuality === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setAudioQuality(opt.value)}
                    style={{
                      flex: 1,
                      backgroundColor: isActive ? `${accentColor}15` : COLORS.backgroundCard,
                      borderRadius: RADIUS.lg, paddingVertical: 8, paddingHorizontal: 4,
                      alignItems: 'center',
                      borderWidth: 1.5, borderColor: isActive ? accentColor : COLORS.border,
                    }}
                  >
                    <Ionicons
                      name={opt.icon as any} size={14}
                      color={isActive ? accentColor : COLORS.textMuted}
                      style={{ marginBottom: 3 }}
                    />
                    <Text style={{
                      color: isActive ? accentColor : COLORS.textSecondary,
                      fontSize: 10, fontWeight: isActive ? '700' : '500',
                    }}>
                      {opt.label}
                    </Text>
                    {opt.creditBonus > 0 && (
                      <View style={{
                        marginTop: 2,
                        backgroundColor: isActive ? `${accentColor}20` : `${COLORS.warning}15`,
                        borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1,
                        borderWidth: 1, borderColor: isActive ? `${accentColor}40` : `${COLORS.warning}30`,
                      }}>
                        <Text style={{ color: isActive ? accentColor : COLORS.warning, fontSize: 8, fontWeight: '700' }}>
                          +{opt.creditBonus} cr
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* FIX 1: Cost breakdown when quality add-on applies */}
            {audioQuality !== 'standard' && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: `${accentColor}08`, borderRadius: RADIUS.lg,
                padding: SPACING.sm, marginBottom: SPACING.sm,
                borderWidth: 1, borderColor: `${accentColor}20`,
              }}>
                <Ionicons name="flash-outline" size={12} color={accentColor} />
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1 }}>
                  {baseCreditCost} cr (base) + {qualityAddOn} cr (quality) ={' '}
                  <Text style={{ color: accentColor, fontWeight: '700' }}>{totalCreditCost} cr total</Text>
                </Text>
              </View>
            )}

            {/* Generate button */}
            <TouchableOpacity
              onPress={handleGenerate}
              disabled={isConsuming || !topic.trim()}
              activeOpacity={0.85}
              style={{
                backgroundColor: topic.trim() ? accentColor : `${accentColor}50`,
                borderRadius: RADIUS.lg, paddingVertical: 14,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {isConsuming
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name="mic" size={18} color="#FFF" />}
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                {isConsuming ? 'Checking credits...' : `Generate Episode ${episodeNum}`}
              </Text>
              {!isConsuming && (
                <View style={{
                  backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full,
                  paddingHorizontal: 7, paddingVertical: 2,
                  flexDirection: 'row', alignItems: 'center', gap: 2,
                }}>
                  <Ionicons name="flash" size={9} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>{totalCreditCost}</Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </LinearGradient>

      <InsufficientCreditsModal
        visible={!!insufficientInfo}
        info={insufficientInfo}
        onClose={clearInsufficient}
      />
    </Animated.View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function PodcastSeriesScreen() {
  const params   = useLocalSearchParams<{ seriesId: string }>();
  const seriesId = params.seriesId;

  const {
    detail, loading, refresh,
    recommendations, loadingRec, loadRecommendations,
    initialSuggestions, loadingInitial,
    loadInitialSuggestions,
  } = useSeriesDetail(seriesId ?? null);

  // FIX 3 & 4: Get remove and refresh from usePodcastSeries so tab updates too
  const { removeEpisode, update, remove, refresh: refreshSeriesList } = usePodcastSeries();

  const [removingId,    setRemovingId]    = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSavingEdit,  setIsSavingEdit]  = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('');

  const scrollViewRef = useRef<ScrollView>(null);
  const accentColor   = detail?.series.accentColor ?? '#6C63FF';

  const handleSelectTopic = useCallback((topic: string) => {
    setSelectedTopic(topic);
    setShowGenerator(true);
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 300);
  }, []);

  const handleRemoveEpisode = useCallback(async (episode: SeriesEpisodeSummary) => {
    Alert.alert(
      'Remove from Series',
      `Remove "${episode.title}" from this series?\n\nThe episode stays in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setRemovingId(episode.podcastId);
            await removeEpisode(episode.podcastId, seriesId ?? '');
            // FIX 3: refresh both detail and the main series list
            refresh();
            setRemovingId(null);
          },
        },
      ]
    );
  }, [removeEpisode, seriesId, refresh]);

  const handlePlayEpisode = useCallback((episode: SeriesEpisodeSummary) => {
    router.push({
      pathname: '/(app)/podcast-player' as any,
      params:   { podcastId: episode.podcastId },
    });
  }, []);

  const handleUpdateSeries = useCallback(async (_seriesId: string, input: Partial<any>) => {
    if (!seriesId) return;
    setIsSavingEdit(true);
    try {
      await update(seriesId, input);
      refresh();
      setShowEditModal(false);
    } finally {
      setIsSavingEdit(false);
    }
  }, [seriesId, update, refresh]);

  // FIX 4: Delete calls refreshSeriesList() before navigating back so the
  // podcast tab's series section is already updated when the user lands there
  const handleDeleteSeries = useCallback(() => {
    if (!detail) return;
    const episodeCount = detail.episodes.length;
    Alert.alert(
      'Delete Series',
      `Delete "${detail.series.name}"?\n\n${
        episodeCount > 0
          ? `Your ${episodeCount} episode${episodeCount !== 1 ? 's' : ''} will be kept in your library.`
          : 'The series folder will be removed.'
      }\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Series', style: 'destructive',
          onPress: async () => {
            await remove(seriesId ?? '');
            // FIX 4: refreshSeriesList() filters the deleted series from
            // local state immediately so the tab updates without re-fetch
            await refreshSeriesList();
            router.back();
          },
        },
      ]
    );
  }, [detail, remove, seriesId, refreshSeriesList]);

  const totalMins      = detail ? Math.round(detail.series.totalDurationSeconds / 60) : 0;
  const nextEpisodeNum = (detail?.series.episodeCount ?? 0) + 1;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm,
          }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: COLORS.border,
              }}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', flex: 1,
            }} numberOfLines={1}>
              {loading ? 'Loading...' : (detail?.series.name ?? 'Series')}
            </Text>

            {detail && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setShowEditModal(true)}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: `${accentColor}15`,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: `${accentColor}30`,
                  }}
                >
                  <Ionicons name="pencil-outline" size={16} color={accentColor} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteSeries}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: `${COLORS.error}10`,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: `${COLORS.error}25`,
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={accentColor} />
            </View>
          ) : !detail ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
              <Ionicons name="alert-circle-outline" size={48} color={COLORS.border} />
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600', marginTop: SPACING.md, textAlign: 'center' }}>
                Series not found
              </Text>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ marginTop: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 10, paddingHorizontal: 24 }}
              >
                <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Go Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              ref={scrollViewRef}
              contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Series header card */}
              <Animated.View entering={FadeIn.duration(400)}>
                <LinearGradient
                  colors={[`${accentColor}20`, `${accentColor}08`]}
                  style={{
                    borderRadius: RADIUS.xl, padding: SPACING.lg,
                    marginBottom: SPACING.lg,
                    borderWidth: 1, borderColor: `${accentColor}30`,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md }}>
                    <View style={{
                      width: 56, height: 56, borderRadius: 17,
                      backgroundColor: `${accentColor}25`,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: `${accentColor}40`,
                    }}>
                      <Ionicons
                        name={(detail.series.iconName ?? 'radio-outline') as any}
                        size={26} color={accentColor}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' }}>
                        {detail.series.name}
                      </Text>
                      {detail.series.description ? (
                        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginTop: 4, lineHeight: 18 }}>
                          {detail.series.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Stats strip */}
                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    <View style={{
                      backgroundColor: `${accentColor}15`, borderRadius: RADIUS.lg,
                      paddingHorizontal: 12, paddingVertical: 7,
                      alignItems: 'center', flex: 1,
                    }}>
                      {/* FIX 3: show live episodeCount from DB */}
                      <Text style={{ color: accentColor, fontSize: FONTS.sizes.md, fontWeight: '800' }}>
                        {detail.series.episodeCount}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600', marginTop: 2 }}>EPISODES</Text>
                    </View>
                    {totalMins > 0 && (
                      <View style={{
                        backgroundColor: `${accentColor}10`, borderRadius: RADIUS.lg,
                        paddingHorizontal: 12, paddingVertical: 7,
                        alignItems: 'center', flex: 1,
                      }}>
                        <Text style={{ color: accentColor, fontSize: FONTS.sizes.md, fontWeight: '800' }}>
                          {totalMins}m
                        </Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600', marginTop: 2 }}>TOTAL</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedTopic('');
                        setShowGenerator(true);
                        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300);
                      }}
                      style={{
                        backgroundColor: accentColor, borderRadius: RADIUS.lg,
                        paddingHorizontal: 14, paddingVertical: 7,
                        alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'row', gap: 5,
                      }}
                    >
                      <Ionicons name="add" size={16} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>New Ep</Text>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* Initial suggestions (0 episodes) */}
              {detail.episodes.length === 0 && (
                <InitialSuggestionsPanel
                  suggestions={initialSuggestions}
                  loadingInitial={loadingInitial}
                  accentColor={accentColor}
                  onSelectTopic={handleSelectTopic}
                  // FIX 5: regenerate calls loadInitialSuggestions with force=true
                  onRegenerate={() => loadInitialSuggestions(true)}
                />
              )}

              {/* Advanced recommendations (1+ episodes) */}
              {detail.episodes.length >= 1 && (
                <AdvancedRecommendationPanel
                  recommendations={recommendations}
                  loadingRec={loadingRec}
                  accentColor={accentColor}
                  onLoadRecommendations={loadRecommendations}
                  onSelectTopic={handleSelectTopic}
                />
              )}

              {/* Episodes list */}
              {detail.episodes.length > 0 && (
                <>
                  <Text style={{
                    color: COLORS.textSecondary, fontSize: FONTS.sizes.sm,
                    fontWeight: '600', letterSpacing: 0.8,
                    textTransform: 'uppercase', marginBottom: SPACING.sm,
                  }}>
                    Episodes
                  </Text>
                  {detail.episodes.map((ep, idx) =>
                    removingId === ep.podcastId ? (
                      <View key={ep.podcastId} style={{
                        height: 80, backgroundColor: COLORS.backgroundCard,
                        borderRadius: RADIUS.xl, marginBottom: SPACING.sm,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: COLORS.border,
                      }}>
                        <ActivityIndicator size="small" color={accentColor} />
                      </View>
                    ) : (
                      <EpisodeRow
                        key={ep.podcastId}
                        episode={ep} index={idx} accentColor={accentColor}
                        onPlay={() => handlePlayEpisode(ep)}
                        onRemove={() => handleRemoveEpisode(ep)}
                      />
                    )
                  )}
                </>
              )}

              {/* Empty state */}
              {detail.episodes.length === 0 && !showGenerator && initialSuggestions.length === 0 && !loadingInitial && (
                <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                  <View style={{
                    width: 64, height: 64, borderRadius: 20,
                    backgroundColor: COLORS.backgroundElevated,
                    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
                  }}>
                    <Ionicons name="radio-outline" size={28} color={COLORS.border} />
                  </View>
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600', textAlign: 'center' }}>
                    No episodes yet
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20 }}>
                    Tap New Ep to get started
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowGenerator(true);
                      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300);
                    }}
                    style={{
                      marginTop: SPACING.lg, backgroundColor: accentColor,
                      borderRadius: RADIUS.lg, paddingVertical: 12, paddingHorizontal: 24,
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Ionicons name="mic" size={16} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Create First Episode</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Inline generator */}
              {showGenerator && seriesId && detail && (
                <View style={{ marginTop: SPACING.md }}>
                  <InlineEpisodeGenerator
                    seriesId={seriesId}
                    seriesName={detail.series.name}
                    episodeNum={nextEpisodeNum}
                    accentColor={accentColor}
                    prefillTopic={selectedTopic}
                    onComplete={() => {
                      setShowGenerator(false);
                      setSelectedTopic('');
                      // FIX 3: refresh both detail and the main series list
                      refresh();
                      refreshSeriesList();
                    }}
                  />
                </View>
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Edit Modal */}
      {detail && (
        <SeriesCreatorModal
          visible={showEditModal}
          mode="edit"
          existingData={detail.series}
          onClose={() => setShowEditModal(false)}
          onCreate={async () => {}}
          onUpdate={handleUpdateSeries}
          isSaving={isSavingEdit}
        />
      )}
    </LinearGradient>
  );
}